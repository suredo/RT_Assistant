import axios from 'axios';
import { chat, reply, SYSTEM_PROMPT, DISCUSS_PROMPT, TEAM_PROMPT } from '../src/ai/glm';

jest.mock('axios');
const mockPost = jest.mocked(axios.post);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DISCUSS_PROMPT', () => {
  test('is exported and is a non-empty string', () => {
    expect(typeof DISCUSS_PROMPT).toBe('string');
    expect(DISCUSS_PROMPT.length).toBeGreaterThan(0);
  });

  test('differs from SYSTEM_PROMPT', () => {
    expect(DISCUSS_PROMPT).not.toBe(SYSTEM_PROMPT);
  });
});

describe('chat()', () => {
  test('returns LLM content on success', async () => {
    mockPost.mockResolvedValue({
      data: { choices: [{ message: { content: 'Olá!' } }] }
    });

    const result = await chat([{ role: 'user', content: 'oi' }]);
    expect(result).toBe('Olá!');
  });

  test('throws on API error so callers can handle it', async () => {
    mockPost.mockRejectedValue(new Error('Network error'));
    await expect(chat([{ role: 'user', content: 'oi' }])).rejects.toThrow('Network error');
  });
});

describe('reply()', () => {
  test('returns LLM response on success', async () => {
    mockPost.mockResolvedValue({
      data: { choices: [{ message: { content: 'Como posso ajudar?' } }] }
    });

    const result = await reply('oi');
    expect(result).toBe('Como posso ajudar?');
  });

  test('returns Portuguese fallback message on API error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockPost.mockRejectedValue(new Error('API timeout'));
    const result = await reply('oi');
    expect(result).toContain('⚠️');
    spy.mockRestore();
  });

  test('prepends system prompt to the request', async () => {
    mockPost.mockResolvedValue({
      data: { choices: [{ message: { content: 'ok' } }] }
    });

    await reply('oi');

    const body = mockPost.mock.calls[0][1] as { messages: Array<{ role: string; content: string }> };
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBeTruthy();
  });

  test('uses SYSTEM_PROMPT by default', async () => {
    mockPost.mockResolvedValue({
      data: { choices: [{ message: { content: 'ok' } }] }
    });

    await reply('oi');

    const body = mockPost.mock.calls[0][1] as { messages: Array<{ role: string; content: string }> };
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
  });

  test('uses custom prompt when provided', async () => {
    mockPost.mockResolvedValue({
      data: { choices: [{ message: { content: 'ok' } }] }
    });

    await reply('oi', [], TEAM_PROMPT);

    const body = mockPost.mock.calls[0][1] as { messages: Array<{ role: string; content: string }> };
    expect(body.messages[0].content).toBe(TEAM_PROMPT);
  });

  test('includes conversation history between system prompt and new message', async () => {
    mockPost.mockResolvedValue({
      data: { choices: [{ message: { content: 'ok' } }] }
    });

    const history = [
      { role: 'user' as const, content: 'previous message' },
      { role: 'assistant' as const, content: 'previous response' }
    ];
    await reply('follow up', history);

    const body = mockPost.mock.calls[0][1] as { messages: Array<{ role: string; content: string }> };
    const { messages } = body;
    expect(messages).toContainEqual({ role: 'user', content: 'previous message' });
    expect(messages).toContainEqual({ role: 'assistant', content: 'previous response' });
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'follow up' });
  });
});
