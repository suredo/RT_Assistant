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

  test('extracts queryFilters for a resolved demand query', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'query', category: 'rotina', priority: 'low', summary: 'Consulta de resolvidas',
      demandIndex: null, resolved: false,
      queryFilters: { status: 'resolved', category: null, priority: null }
    }));

    const result = await classify('quais demandas foram resolvidas?');

    expect(result.queryFilters).toEqual({ status: 'resolved', category: null, priority: null });
  });

  test('extracts queryFilters with category and priority filters', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'query', category: 'urgência clínica', priority: 'high', summary: 'Consulta filtrada',
      demandIndex: null, resolved: false,
      queryFilters: { status: 'open', category: 'urgência clínica', priority: 'high' }
    }));

    const result = await classify('demandas urgentes de urgência clínica');

    expect(result.queryFilters).toEqual({ status: 'open', category: 'urgência clínica', priority: 'high' });
  });

  test('extracts queryFilters with status=all', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'query', category: 'rotina', priority: 'low', summary: 'Todas demandas',
      demandIndex: null, resolved: false,
      queryFilters: { status: 'all', category: null, priority: null }
    }));

    const result = await classify('me mostra todas as demandas');

    expect(result.queryFilters?.status).toBe('all');
  });

  test('sets queryFilters to null for non-query types', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'new_demand', category: 'rotina', priority: 'low', summary: 'Nova demanda',
      demandIndex: null, resolved: false, queryFilters: null
    }));

    const result = await classify('falta papel na impressora');

    expect(result.queryFilters).toBeNull();
  });

  test('classifies add_note with demandIndex and note text', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'add_note', category: 'rotina', priority: 'low',
      summary: 'Nota adicionada', demandIndex: 2, resolved: false,
      queryFilters: null, note: 'Liguei para o fornecedor, aguardando retorno'
    }));

    const result = await classify('adicionar nota na demanda 2: liguei para o fornecedor');

    expect(result.type).toBe('add_note');
    expect(result.demandIndex).toBe(2);
    expect(result.note).toBe('Liguei para o fornecedor, aguardando retorno');
  });

  test('sets note to null for non-add_note types', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'new_demand', category: 'rotina', priority: 'low', summary: 'Demanda',
      demandIndex: null, resolved: false, queryFilters: null
    }));

    const result = await classify('falta papel');

    expect(result.note).toBeNull();
  });

  test('defaults queryFilters.status to open when LLM omits it', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'query', category: 'rotina', priority: 'low', summary: 'Consulta',
      demandIndex: null, resolved: false,
      queryFilters: { category: null, priority: null }
    }));

    const result = await classify('o que está pendente?');

    expect(result.queryFilters?.status).toBe('open');
  });
});

describe('classify() — workflow intents', () => {
  beforeEach(() => jest.clearAllMocks());

  test('classifies trigger_workflow with workflowId and workflowVariables', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'trigger_workflow',
      category: 'rotina',
      priority: 'low',
      summary: 'Onboarding de Frank',
      demandIndex: null,
      resolved: false,
      queryFilters: null,
      note: null,
      workflowId: 'wf-uuid-123',
      workflowVariables: { name: 'Frank' }
    }));

    const result = await classify('Frank foi contratado');

    expect(result.type).toBe('trigger_workflow');
    expect(result.workflowId).toBe('wf-uuid-123');
    expect(result.workflowVariables).toEqual({ name: 'Frank' });
  });

  test('classifies manage_workflows with null workflowId and workflowVariables', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'manage_workflows',
      category: 'rotina',
      priority: 'low',
      summary: 'Listar workflows',
      demandIndex: null,
      resolved: false,
      queryFilters: null,
      note: null,
      workflowId: null,
      workflowVariables: null
    }));

    const result = await classify('quais workflows estão ativos?');

    expect(result.type).toBe('manage_workflows');
    expect(result.workflowId).toBeNull();
    expect(result.workflowVariables).toBeNull();
  });

  test('FALLBACK has workflowId and workflowVariables as null', async () => {
    mockChat.mockResolvedValue('texto inválido sem json');

    const result = await classify('mensagem qualquer');

    expect(result.workflowId).toBeNull();
    expect(result.workflowVariables).toBeNull();
  });

  test('sets workflowId to null for non-trigger_workflow types', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'new_demand', category: 'rotina', priority: 'low', summary: 'Demanda',
      demandIndex: null, resolved: false, queryFilters: null, note: null,
      workflowId: 'wf-should-be-ignored', workflowVariables: { key: 'val' }
    }));

    const result = await classify('falta papel na impressora');

    expect(result.workflowId).toBeNull();
    expect(result.workflowVariables).toBeNull();
  });

  test('injects active workflows into classify prompt', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'trigger_workflow', category: 'rotina', priority: 'low', summary: 'Onboarding',
      demandIndex: null, resolved: false, queryFilters: null, note: null,
      workflowId: 'wf-1', workflowVariables: { name: 'Ana' }
    }));

    const workflows = [{ id: 'wf-1', name: 'Onboarding', description: 'Quando alguém é contratado' }];
    const result = await classify('Ana foi contratada', workflows);

    expect(result.type).toBe('trigger_workflow');
    expect(mockChat).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ role: 'system', content: expect.stringContaining('wf-1') })
    ]));
  });

  test('classifies suggest_workflow with demand fields populated', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'suggest_workflow',
      category: 'gestão de equipe',
      priority: 'medium',
      summary: 'Abertura de vaga para estagiário',
      demandIndex: null,
      resolved: false,
      queryFilters: null,
      note: null,
      workflowId: null,
      workflowVariables: null,
    }));

    const result = await classify('Abrir vaga para estagiário');

    expect(result.type).toBe('suggest_workflow');
    expect(result.category).toBe('gestão de equipe');
    expect(result.priority).toBe('medium');
    expect(result.summary).toBe('Abertura de vaga para estagiário');
    expect(result.workflowId).toBeNull();
    expect(result.workflowVariables).toBeNull();
  });

  test('suggest_workflow prompt includes the suggest_workflow type', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'new_demand', category: 'rotina', priority: 'low', summary: 'x',
      demandIndex: null, resolved: false, queryFilters: null, note: null,
      workflowId: null, workflowVariables: null,
    }));

    await classify('Abrir vaga para técnico');

    expect(mockChat).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ role: 'system', content: expect.stringContaining('suggest_workflow') })
    ]));
  });
});

describe('classify() — discuss intent', () => {
  beforeEach(() => jest.clearAllMocks());

  test('classifies discuss for a planning/opinion message', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      type: 'discuss',
      category: 'rotina',
      priority: 'low',
      summary: 'RT quer discutir processo de admissão',
      demandIndex: null,
      resolved: false,
      queryFilters: null,
      note: null,
      workflowId: null,
      workflowVariables: null,
    }));

    const result = await classify('o que você acha de mudar o processo de admissão?');

    expect(result.type).toBe('discuss');
    expect(result.workflowId).toBeNull();
    expect(result.queryFilters).toBeNull();
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
