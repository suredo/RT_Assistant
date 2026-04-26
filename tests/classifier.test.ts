import { classify } from '../src/ai/classifier';
import { chat } from '../src/ai/glm';

jest.mock('../src/ai/glm');
const mockChat = jest.mocked(chat);

describe('classify()', () => {
  beforeEach(() => jest.clearAllMocks());

  test('parses valid JSON from LLM', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      category: 'clinical_urgent',
      priority: 'high',
      type: 'new_demand',
      summary: 'Paciente na cadeira 3 com pressão baixa'
    }));

    const result = await classify('paciente na cadeira 3 com pressão baixa');

    expect(result.category).toBe('clinical_urgent');
    expect(result.priority).toBe('high');
    expect(result.type).toBe('new_demand');
    expect(result.summary).toBeTruthy();
  });

  test('extracts JSON when LLM wraps it in text', async () => {
    mockChat.mockResolvedValue('Here is the classification: {"type":"query","category":"routine","priority":"low","summary":"Consulta de pendências"}');

    const result = await classify('o que está pendente?');

    expect(result.type).toBe('query');
  });

  test('falls back gracefully when LLM returns malformed JSON', async () => {
    mockChat.mockResolvedValue('Desculpe, não consigo classificar essa mensagem.');

    const result = await classify('alguma mensagem');

    expect(result.category).toBe('routine');
    expect(result.priority).toBe('low');
    expect(result.type).toBe('new_demand');
  });

  test('falls back gracefully when LLM returns empty response', async () => {
    mockChat.mockResolvedValue('');

    const result = await classify('alguma mensagem');

    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('priority');
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('summary');
  });

  test('falls back gracefully when LLM call throws', async () => {
    mockChat.mockRejectedValue(new Error('API timeout'));

    await expect(classify('alguma mensagem')).resolves.toHaveProperty('category');
  });

  test('uses fallback values for missing JSON fields', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ type: 'update' }));

    const result = await classify('atualizando demanda');

    expect(result.type).toBe('update');
    expect(result.category).toBe('routine');
    expect(result.priority).toBe('low');
  });
});
