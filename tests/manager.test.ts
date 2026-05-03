jest.mock('../src/ai/glm', () => ({ chat: jest.fn() }));

jest.mock('../src/db/workflows', () => ({
  getAllWorkflows: jest.fn(),
  createWorkflow: jest.fn(),
  updateWorkflow: jest.fn(),
  createWorkflowStep: jest.fn(),
  deleteWorkflowSteps: jest.fn(),
  upsertTemplate: jest.fn(),
}));

import { handleManageWorkflows, executeManageCommand, modifyManageCommand, formatWorkflowList, ManageResult } from '../src/workflows/manager';
import { chat } from '../src/ai/glm';
import {
  getAllWorkflows, createWorkflow, updateWorkflow,
  createWorkflowStep, deleteWorkflowSteps, upsertTemplate,
} from '../src/db/workflows';

const mockChat            = jest.mocked(chat);
const mockGetAll          = jest.mocked(getAllWorkflows);
const mockCreate          = jest.mocked(createWorkflow);
const mockUpdate          = jest.mocked(updateWorkflow);
const mockCreateStep      = jest.mocked(createWorkflowStep);
const mockDeleteSteps     = jest.mocked(deleteWorkflowSteps);
const mockUpsertTemplate  = jest.mocked(upsertTemplate);

const WF_ACTIVE   = { id: 'w1', name: 'Onboarding', description: 'Quando alguém é contratado', is_active: true,  created_at: '' };
const WF_INACTIVE = { id: 'w2', name: 'Offboarding', description: 'Quando alguém sai',          is_active: false, created_at: '' };

const STEPS_DEF = [
  { step_order: 1, step_type: 'send_message', content: 'Bem-vindo, {{name}}!' },
  { step_order: 2, step_type: 'ask_question', content: 'Qual o cargo de {{name}}?', variable_name: 'role' },
];

// Helper: extracts the response string from an 'immediate' result, throws otherwise
function immediateResponse(result: ManageResult): string {
  if (result.type !== 'immediate') throw new Error(`Expected immediate, got ${result.type}`);
  return result.response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateStep.mockResolvedValue({ id: 's1', workflow_id: 'w1', step_order: 1, step_type: 'send_message', content: 'Test' });
  mockDeleteSteps.mockResolvedValue(undefined);
  mockUpdate.mockResolvedValue(undefined);
  mockUpsertTemplate.mockResolvedValue({ id: 't1', name: 'Test — passo 1', content: 'Test', created_at: '' });
});

// ── formatWorkflowList ─────────────────────────────────────────────────────────

describe('formatWorkflowList()', () => {
  test('returns empty message for empty array', () => {
    expect(formatWorkflowList([])).toContain('Nenhum workflow');
  });

  test('formats active workflow with ✅', () => {
    const result = formatWorkflowList([WF_ACTIVE]);
    expect(result).toContain('✅');
    expect(result).toContain('Onboarding');
    expect(result).toContain('Quando alguém é contratado');
  });

  test('formats inactive workflow with ⏸️', () => {
    const result = formatWorkflowList([WF_INACTIVE]);
    expect(result).toContain('⏸️');
    expect(result).toContain('Offboarding');
  });

  test('numbers multiple workflows', () => {
    const result = formatWorkflowList([WF_ACTIVE, WF_INACTIVE]);
    expect(result).toContain('1.');
    expect(result).toContain('2.');
  });
});

// ── list ───────────────────────────────────────────────────────────────────────

describe('handleManageWorkflows() — list', () => {
  test('returns formatted list of all workflows', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'list' }));
    mockGetAll.mockResolvedValue([WF_ACTIVE, WF_INACTIVE]);

    const result = await handleManageWorkflows('quais workflows existem?');

    expect(result.type).toBe('immediate');
    const response = immediateResponse(result);
    expect(response).toContain('Onboarding');
    expect(response).toContain('Offboarding');
    expect(response).toContain('✅');
    expect(response).toContain('⏸️');
  });

  test('returns empty message when no workflows', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'list' }));
    mockGetAll.mockResolvedValue([]);

    const result = await handleManageWorkflows('lista workflows');

    expect(immediateResponse(result)).toContain('Nenhum workflow');
  });
});

// ── create — handleManageWorkflows returns preview ─────────────────────────────

describe('handleManageWorkflows() — create', () => {
  test('returns preview for valid create command (no DB write yet)', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      operation: 'create',
      name: 'Onboarding',
      description: 'Quando alguém é contratado',
      steps: STEPS_DEF,
    }));

    const result = await handleManageWorkflows('cria workflow de onboarding');

    expect(result.type).toBe('preview');
    if (result.type === 'preview') {
      expect(result.preview).toContain('Onboarding');
      expect(result.preview).toContain('Quando alguém é contratado');
      expect(result.preview).toContain('sim/não');
      expect(result.cmd.operation).toBe('create');
      expect(result.cmd.name).toBe('Onboarding');
      expect(result.cmd.steps).toHaveLength(2);
    }
    // DB must NOT be touched until user confirms
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateStep).not.toHaveBeenCalled();
  });

  test('preview lists all steps with human-readable labels', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      operation: 'create',
      name: 'Test',
      description: 'Gatilho',
      steps: STEPS_DEF,
    }));

    const result = await handleManageWorkflows('cria workflow test');

    if (result.type === 'preview') {
      expect(result.preview).toContain('Enviar mensagem');  // send_message label
      expect(result.preview).toContain('Perguntar');        // ask_question label
      expect(result.preview).toContain('Bem-vindo');        // step content
      expect(result.preview).toContain('{{role}}');         // captured variable
    }
  });

  test('returns immediate error when name is missing', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'create', description: 'Gatilho', steps: STEPS_DEF }));

    const result = await handleManageWorkflows('cria workflow');

    expect(result.type).toBe('immediate');
    expect(immediateResponse(result)).toContain('⚠️');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('returns immediate error when description is missing', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'create', name: 'Test', steps: STEPS_DEF }));

    const result = await handleManageWorkflows('cria workflow test');

    expect(result.type).toBe('immediate');
    expect(immediateResponse(result)).toContain('⚠️');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('returns immediate error when steps array is empty', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'create', name: 'Test', description: 'Desc', steps: [] }));

    const result = await handleManageWorkflows('cria workflow vazio');

    expect(result.type).toBe('immediate');
    expect(immediateResponse(result)).toContain('⚠️');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── create — executeManageCommand writes to DB ─────────────────────────────────

describe('executeManageCommand() — create', () => {
  test('creates workflow and all steps, returns success message', async () => {
    mockCreate.mockResolvedValue(WF_ACTIVE);

    const result = await executeManageCommand({
      operation: 'create',
      name: 'Onboarding',
      description: 'Quando alguém é contratado',
      steps: STEPS_DEF,
    });

    expect(mockCreate).toHaveBeenCalledWith('Onboarding', 'Quando alguém é contratado');
    expect(mockCreateStep).toHaveBeenCalledTimes(2);
    expect(mockCreateStep).toHaveBeenCalledWith(expect.objectContaining({ step_type: 'send_message' }));
    expect(mockCreateStep).toHaveBeenCalledWith(expect.objectContaining({ variable_name: 'role' }));
    expect(result).toContain('criado');
    expect(result).toContain('2 passos');
  });

  test('singular "passo" when only one step', async () => {
    mockCreate.mockResolvedValue({ ...WF_ACTIVE, name: 'Simple' });

    const result = await executeManageCommand({
      operation: 'create',
      name: 'Simple',
      description: 'Gatilho',
      steps: [STEPS_DEF[0]],
    });

    expect(result).toContain('1 passo');
    expect(result).not.toContain('1 passos');
  });

  test('upserts message_template for send_message step and links template_id', async () => {
    mockCreate.mockResolvedValue(WF_ACTIVE);
    const tpl = { id: 't1', name: 'Onboarding — passo 1', content: 'Bem-vindo, {{name}}!', created_at: '' };
    mockUpsertTemplate.mockResolvedValue(tpl);

    await executeManageCommand({
      operation: 'create',
      name: 'Onboarding',
      description: 'Quando alguém é contratado',
      steps: [STEPS_DEF[0]], // send_message only
    });

    expect(mockUpsertTemplate).toHaveBeenCalledWith('Onboarding — passo 1', STEPS_DEF[0].content);
    expect(mockCreateStep).toHaveBeenCalledWith(expect.objectContaining({ template_id: 't1' }));
  });

  test('does not call upsertTemplate for ask_question steps', async () => {
    mockCreate.mockResolvedValue(WF_ACTIVE);

    await executeManageCommand({
      operation: 'create',
      name: 'Onboarding',
      description: 'Gatilho',
      steps: [STEPS_DEF[1]], // ask_question only
    });

    expect(mockUpsertTemplate).not.toHaveBeenCalled();
    expect(mockCreateStep).toHaveBeenCalledWith(expect.objectContaining({ template_id: undefined }));
  });

  test('step is still saved even if upsertTemplate fails', async () => {
    mockCreate.mockResolvedValue(WF_ACTIVE);
    mockUpsertTemplate.mockRejectedValue(new Error('DB error'));

    const result = await executeManageCommand({
      operation: 'create',
      name: 'Onboarding',
      description: 'Gatilho',
      steps: [STEPS_DEF[0]],
    });

    // Step should still be created without template_id
    expect(mockCreateStep).toHaveBeenCalledWith(expect.objectContaining({ template_id: undefined }));
    expect(result).toContain('criado');
  });

  test('returns error when name is missing', async () => {
    const result = await executeManageCommand({ operation: 'create', description: 'Gatilho', steps: STEPS_DEF });

    expect(result).toContain('⚠️');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── toggle ─────────────────────────────────────────────────────────────────────

describe('handleManageWorkflows() — toggle', () => {
  test('deactivates an existing workflow', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'toggle', name: 'Onboarding', active: false }));
    mockGetAll.mockResolvedValue([WF_ACTIVE]);

    const result = await handleManageWorkflows('desativa o workflow de onboarding');

    expect(mockUpdate).toHaveBeenCalledWith('w1', { is_active: false });
    expect(immediateResponse(result)).toContain('desativado');
  });

  test('activates an existing workflow', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'toggle', name: 'Offboarding', active: true }));
    mockGetAll.mockResolvedValue([WF_INACTIVE]);

    const result = await handleManageWorkflows('ativa o workflow de offboarding');

    expect(mockUpdate).toHaveBeenCalledWith('w2', { is_active: true });
    expect(immediateResponse(result)).toContain('ativado');
  });

  test('is case-insensitive when matching workflow name', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'toggle', name: 'onboarding', active: false }));
    mockGetAll.mockResolvedValue([WF_ACTIVE]);

    const result = await handleManageWorkflows('desativa onboarding');

    expect(mockUpdate).toHaveBeenCalledWith('w1', { is_active: false });
    expect(immediateResponse(result)).not.toContain('não encontrado');
  });

  test('returns error when workflow not found', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'toggle', name: 'Inexistente', active: false }));
    mockGetAll.mockResolvedValue([WF_ACTIVE]);

    const result = await handleManageWorkflows('desativa workflow inexistente');

    expect(immediateResponse(result)).toContain('não encontrado');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('returns error when active flag is missing', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'toggle', name: 'Onboarding' }));

    const result = await handleManageWorkflows('toggle onboarding');

    expect(immediateResponse(result)).toContain('⚠️');
  });
});

// ── edit — handleManageWorkflows returns preview ───────────────────────────────

describe('handleManageWorkflows() — edit', () => {
  const NEW_STEPS = [{ step_order: 1, step_type: 'send_message', content: 'Novo passo' }];

  test('returns preview for valid edit command (no DB write yet)', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'edit', name: 'Onboarding', steps: NEW_STEPS }));
    mockGetAll.mockResolvedValue([WF_ACTIVE]);

    const result = await handleManageWorkflows('edita onboarding com novo passo');

    expect(result.type).toBe('preview');
    if (result.type === 'preview') {
      expect(result.preview).toContain('Onboarding');
      expect(result.preview).toContain('sim/não');
      expect(result.cmd.operation).toBe('edit');
    }
    expect(mockDeleteSteps).not.toHaveBeenCalled();
    expect(mockCreateStep).not.toHaveBeenCalled();
  });

  test('returns immediate error when workflow not found', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'edit', name: 'Inexistente', steps: NEW_STEPS }));
    mockGetAll.mockResolvedValue([]);

    const result = await handleManageWorkflows('edita workflow inexistente');

    expect(immediateResponse(result)).toContain('não encontrado');
    expect(mockDeleteSteps).not.toHaveBeenCalled();
  });

  test('returns immediate error when steps are missing', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'edit', name: 'Onboarding' }));

    const result = await handleManageWorkflows('edita onboarding');

    expect(immediateResponse(result)).toContain('⚠️');
  });
});

// ── edit — executeManageCommand writes to DB ───────────────────────────────────

describe('executeManageCommand() — edit', () => {
  const NEW_STEPS = [{ step_order: 1, step_type: 'send_message', content: 'Novo passo' }];

  test('deletes old steps and creates new ones', async () => {
    mockGetAll.mockResolvedValue([WF_ACTIVE]);

    const result = await executeManageCommand({ operation: 'edit', name: 'Onboarding', steps: NEW_STEPS });

    expect(mockDeleteSteps).toHaveBeenCalledWith('w1');
    expect(mockCreateStep).toHaveBeenCalledTimes(1);
    expect(result).toContain('atualizado');
    expect(result).toContain('1 passo');
  });

  test('also updates description when provided', async () => {
    mockGetAll.mockResolvedValue([WF_ACTIVE]);

    await executeManageCommand({ operation: 'edit', name: 'Onboarding', description: 'Nova descrição', steps: NEW_STEPS });

    expect(mockUpdate).toHaveBeenCalledWith('w1', { description: 'Nova descrição' });
  });

  test('returns error when workflow not found', async () => {
    mockGetAll.mockResolvedValue([]);

    const result = await executeManageCommand({ operation: 'edit', name: 'Inexistente', steps: NEW_STEPS });

    expect(result).toContain('não encontrado');
    expect(mockDeleteSteps).not.toHaveBeenCalled();
  });
});

// ── fallback / error handling ─────────────────────────────────────────────────

describe('handleManageWorkflows() — fallback', () => {
  test('returns fallback for unknown operation', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'unknown' }));

    const result = await handleManageWorkflows('faça algo aleatório');

    expect(immediateResponse(result)).toContain('⚠️');
    expect(immediateResponse(result)).toContain('listar');
  });

  test('returns fallback when LLM call throws', async () => {
    mockChat.mockRejectedValue(new Error('API timeout'));

    const result = await handleManageWorkflows('lista workflows');

    expect(immediateResponse(result)).toContain('⚠️');
  });

  test('returns fallback when LLM returns malformed JSON', async () => {
    mockChat.mockResolvedValue('texto sem json');

    const result = await handleManageWorkflows('lista workflows');

    expect(immediateResponse(result)).toContain('⚠️');
  });
});

describe('modifyManageCommand()', () => {
  const existingCreate = {
    operation: 'create' as const,
    name: 'Contratação',
    description: 'Quando há necessidade de contratar',
    steps: [
      { step_order: 1, step_type: 'ask_question', content: 'Qual o cargo?', variable_name: 'cargo' },
    ],
  };

  test('returns a new preview with modified steps', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      operation: 'create',
      name: 'Contratação',
      description: 'Quando há necessidade de contratar',
      steps: [
        { step_order: 1, step_type: 'ask_question', content: 'Qual o cargo?', variable_name: 'cargo' },
        { step_order: 2, step_type: 'ask_question', content: 'Qual o departamento?', variable_name: 'depto' },
      ],
    }));

    const result = await modifyManageCommand('adiciona uma pergunta sobre departamento', existingCreate);

    expect(result.type).toBe('preview');
    if (result.type === 'preview') {
      expect(result.cmd.steps).toHaveLength(2);
      expect(result.cmd.steps![1].variable_name).toBe('depto');
    }
  });

  test('preserves the original operation type even if LLM changes it', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      operation: 'edit', // LLM incorrectly returned 'edit' for a create context
      name: 'Contratação',
      description: 'Quando há necessidade de contratar',
      steps: [{ step_order: 1, step_type: 'send_message', content: 'Olá' }],
    }));

    const result = await modifyManageCommand('muda o passo 1 para send_message', existingCreate);

    expect(result.type).toBe('preview');
    if (result.type === 'preview') {
      expect(result.cmd.operation).toBe('create');
    }
  });

  test('returns immediate error when LLM returns unknown operation', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'unknown' }));

    const result = await modifyManageCommand('algo confuso', existingCreate);

    expect(result.type).toBe('immediate');
    if (result.type === 'immediate') {
      expect(result.response).toContain('⚠️');
    }
  });

  test('returns immediate error when LLM call throws', async () => {
    mockChat.mockRejectedValue(new Error('API timeout'));

    const result = await modifyManageCommand('muda tudo', existingCreate);

    expect(result.type).toBe('immediate');
    if (result.type === 'immediate') {
      expect(result.response).toContain('⚠️');
    }
  });
});

describe('manager prompt — send_message constraint', () => {
  test('prompt instructs LLM that send_message delivers only to RT, not third parties', async () => {
    // The constraint must be present in the prompt so the LLM never frames
    // send_message as an outbound send to HR, doctors, or other parties.
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'unknown' }));

    await handleManageWorkflows('crie um workflow para enviar email ao RH');

    const systemMsg = (mockChat.mock.calls[0][0] as Array<{ role: string; content: string }>)
      .find(m => m.role === 'system');
    expect(systemMsg?.content).toContain('NÃO envia para terceiros');
    expect(systemMsg?.content).toContain('Rascunho para encaminhar');
  });
});
