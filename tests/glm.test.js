const axios = require('axios');
const { chat, reply } = require('../src/ai/glm');

jest.mock('axios');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('chat()', () => {
  test('returns LLM content on success', async () => {
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'Olá!' } }] }
    });

    const result = await chat([{ role: 'user', content: 'oi' }]);
    expect(result).toBe('Olá!');
  });

  test('throws on API error so callers can handle it', async () => {
    axios.post.mockRejectedValue(new Error('Network error'));
    await expect(chat([{ role: 'user', content: 'oi' }])).rejects.toThrow('Network error');
  });
});

describe('reply()', () => {
  test('returns LLM response on success', async () => {
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'Como posso ajudar?' } }] }
    });

    const result = await reply('oi');
    expect(result).toBe('Como posso ajudar?');
  });

  test('returns Portuguese fallback message on API error', async () => {
    axios.post.mockRejectedValue(new Error('API timeout'));
    const result = await reply('oi');
    expect(result).toContain('⚠️');
  });

  test('prepends system prompt to the request', async () => {
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'ok' } }] }
    });

    await reply('oi');

    const body = axios.post.mock.calls[0][1];
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBeTruthy();
  });

  test('includes conversation history between system prompt and new message', async () => {
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'ok' } }] }
    });

    const history = [
      { role: 'user', content: 'previous message' },
      { role: 'assistant', content: 'previous response' }
    ];
    await reply('follow up', history);

    const { messages } = axios.post.mock.calls[0][1];
    expect(messages).toContainEqual({ role: 'user', content: 'previous message' });
    expect(messages).toContainEqual({ role: 'assistant', content: 'previous response' });
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'follow up' });
  });
});
