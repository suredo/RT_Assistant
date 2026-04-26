import { classify, mergeSummary } from '../src/ai/classifier';
import { chat } from '../src/ai/glm';

jest.mock('../src/ai/glm');
const mockChat = jest.mocked(chat);

describe('classify()', () => {
  beforeEach(() => jest.clearAllMocks());

  test('parses valid JSON from LLM', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      category: 'urgência clínica',
      priority: 'high',
      type: 'new_demand',
      summary: 'Paciente na cadeira 3 com pressão baixa',
      demandIndex: null,
      resolved: false
    }));

    const result = await classify('paciente na cadeira 3 com pressão baixa');

    expect(result.category).toBe('urgência clínica');
    expect(result.priority).toBe('high');
    expect(result.type).toBe('new_demand');
    expect(result.summary).toBeTruthy();
    expect(result.demandIndex).toBeNull();
    expect(result.resolved).toBe(false);
  });

  test('extracts demandIndex and resolved=true for a resolution message', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'update',
      category: 'rotina',
      priority: 'low',
      summary: 'Demanda 2 resolvida',
      demandIndex: 2,
      resolved: true
    }));

    const result = await classify('demanda 2 foi resolvida');

    expect(result.type).toBe('update');
    expect(result.demandIndex).toBe(2);
    expect(result.resolved).toBe(true);
  });

  test('extracts demandIndex with resolved=false for a priority update', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'update',
      category: 'urgência clínica',
      priority: 'high',
      summary: 'Atualização de prioridade da demanda 1',
      demandIndex: 1,
      resolved: false
    }));

    const result = await classify('muda a demanda 1 para urgente');

    expect(result.demandIndex).toBe(1);
    expect(result.resolved).toBe(false);
    expect(result.priority).toBe('high');
  });

  test('extracts JSON when LLM wraps it in text', async () => {
    mockChat.mockResolvedValue('Here is the classification: {"type":"query","category":"routine","priority":"low","summary":"Consulta de pendências","demandIndex":null,"resolved":false}');

    const result = await classify('o que está pendente?');

    expect(result.type).toBe('query');
  });

  test('falls back gracefully when LLM returns malformed JSON', async () => {
    mockChat.mockResolvedValue('Desculpe, não consigo classificar essa mensagem.');

    const result = await classify('alguma mensagem');

    expect(result.category).toBe('rotina');
    expect(result.priority).toBe('low');
    expect(result.type).toBe('new_demand');
    expect(result.demandIndex).toBeNull();
    expect(result.resolved).toBe(false);
  });

  test('falls back gracefully when LLM returns empty response', async () => {
    mockChat.mockResolvedValue('');

    const result = await classify('alguma mensagem');

    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('priority');
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('demandIndex');
    expect(result).toHaveProperty('resolved');
  });

  test('falls back gracefully when LLM call throws', async () => {
    mockChat.mockRejectedValue(new Error('API timeout'));

    await expect(classify('alguma mensagem')).resolves.toHaveProperty('category');
  });

  test('uses fallback values for missing JSON fields', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ type: 'update' }));

    const result = await classify('atualizando demanda');

    expect(result.type).toBe('update');
    expect(result.category).toBe('rotina');
    expect(result.priority).toBe('low');
    expect(result.demandIndex).toBeNull();
    expect(result.resolved).toBe(false);
  });

  test('ignores demandIndex when LLM returns a non-number value', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'update',
      category: 'rotina',
      priority: 'low',
      summary: 'Atualização',
      demandIndex: 'dois',
      resolved: false
    }));

    const result = await classify('alguma mensagem');

    expect(result.demandIndex).toBeNull();
  });
});

describe('mergeSummary()', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the merged summary from the LLM', async () => {
    mockChat.mockResolvedValue('Paciente na cadeira 3 — médico presente, estabilizando');

    const result = await mergeSummary(
      'Paciente na cadeira 3 com pressão baixa',
      'médico já chegou, estabilizando'
    );

    expect(result).toBe('Paciente na cadeira 3 — médico presente, estabilizando');
  });

  test('falls back to existing summary when LLM returns empty string', async () => {
    mockChat.mockResolvedValue('   ');

    const result = await mergeSummary('Resumo existente', 'nova info');

    expect(result).toBe('Resumo existente');
  });

  test('falls back to existing summary when LLM call throws', async () => {
    mockChat.mockRejectedValue(new Error('API timeout'));

    const result = await mergeSummary('Resumo existente', 'nova info');

    expect(result).toBe('Resumo existente');
  });
});
