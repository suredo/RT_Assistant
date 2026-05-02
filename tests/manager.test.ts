jest.mock('../src/ai/glm', () => ({ chat: jest.fn() }));

jest.mock('../src/db/workflows', () => ({
  getAllWorkflows: jest.fn(),
  createWorkflow: jest.fn(),
  updateWorkflow: jest.fn(),
  createWorkflowStep: jest.fn(),
  deleteWorkflowSteps: jest.fn(),
}));

import { handleManageWorkflows, formatWorkflowList } from '../src/workflows/manager';
import { chat } from '../src/ai/glm';
import {
  getAllWorkflows, createWorkflow, updateWorkflow,
  createWorkflowStep, deleteWorkflowSteps,
} from '../src/db/workflows';

const mockChat         = jest.mocked(chat);
const mockGetAll       = jest.mocked(getAllWorkflows);
const mockCreate       = jest.mocked(createWorkflow);
const mockUpdate       = jest.mocked(updateWorkflow);
const mockCreateStep   = jest.mocked(createWorkflowStep);
const mockDeleteSteps  = jest.mocked(deleteWorkflowSteps);

const WF_ACTIVE   = { id: 'w1', name: 'Onboarding', description: 'Quando alguém é contratado', is_active: true,  created_at: '' };
const WF_INACTIVE = { id: 'w2', name: 'Offboarding', description: 'Quando alguém sai',          is_active: false, created_at: '' };

const STEPS_DEF = [
  { step_order: 1, step_type: 'send_message', content: 'Bem-vindo, {{name}}!' },
  { step_order: 2, step_type: 'ask_question', content: 'Qual o cargo de {{name}}?', variable_name: 'role' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateStep.mockResolvedValue({ id: 's1', workflow_id: 'w1', step_order: 1, step_type: 'send_message', content: 'Test' });
  mockDeleteSteps.mockResolvedValue(undefined);
  mockUpdate.mockResolvedValue(undefined);
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

    expect(result).toContain('Onboarding');
    expect(result).toContain('Offboarding');
    expect(result).toContain('✅');
    expect(result).toContain('⏸️');
  });

  test('returns empty message when no workflows', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'list' }));
    mockGetAll.mockResolvedValue([]);

    const result = await handleManageWorkflows('lista workflows');

    expect(result).toContain('Nenhum workflow');
  });
});

// ── create ─────────────────────────────────────────────────────────────────────

describe('handleManageWorkflows() — create', () => {
  test('creates workflow and all steps, returns success message', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      operation: 'create',
      name: 'Onboarding',
      description: 'Quando alguém é contratado',
      steps: STEPS_DEF,
    }));
    mockCreate.mockResolvedValue(WF_ACTIVE);

    const result = await handleManageWorkflows('cria workflow de onboarding');

    expect(mockCreate).toHaveBeenCalledWith('Onboarding', 'Quando alguém é contratado');
    expect(mockCreateStep).toHaveBeenCalledTimes(2);
    expect(mockCreateStep).toHaveBeenCalledWith(expect.objectContaining({ step_type: 'send_message' }));
    expect(mockCreateStep).toHaveBeenCalledWith(expect.objectContaining({ variable_name: 'role' }));
    expect(result).toContain('criado');
    expect(result).toContain('2 passos');
  });

  test('returns error when name is missing', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'create', description: 'Gatilho', steps: STEPS_DEF }));

    const result = await handleManageWorkflows('cria workflow');

    expect(result).toContain('⚠️');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('returns error when description is missing', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'create', name: 'Test', steps: STEPS_DEF }));

    const result = await handleManageWorkflows('cria workflow test');

    expect(result).toContain('⚠️');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('returns error when steps array is empty', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'create', name: 'Test', description: 'Desc', steps: [] }));

    const result = await handleManageWorkflows('cria workflow vazio');

    expect(result).toContain('⚠️');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('singular "passo" when only one step', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      operation: 'create',
      name: 'Simple',
      description: 'Gatilho',
      steps: [STEPS_DEF[0]],
    }));
    mockCreate.mockResolvedValue({ ...WF_ACTIVE, name: 'Simple' });

    const result = await handleManageWorkflows('cria workflow simples');

    expect(result).toContain('1 passo');
    expect(result).not.toContain('1 passos');
  });
});

// ── toggle ─────────────────────────────────────────────────────────────────────

describe('handleManageWorkflows() — toggle', () => {
  test('deactivates an existing workflow', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'toggle', name: 'Onboarding', active: false }));
    mockGetAll.mockResolvedValue([WF_ACTIVE]);

    const result = await handleManageWorkflows('desativa o workflow de onboarding');

    expect(mockUpdate).toHaveBeenCalledWith('w1', { is_active: false });
    expect(result).toContain('desativado');
  });

  test('activates an existing workflow', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'toggle', name: 'Offboarding', active: true }));
    mockGetAll.mockResolvedValue([WF_INACTIVE]);

    const result = await handleManageWorkflows('ativa o workflow de offboarding');

    expect(mockUpdate).toHaveBeenCalledWith('w2', { is_active: true });
    expect(result).toContain('ativado');
  });

  test('is case-insensitive when matching workflow name', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'toggle', name: 'onboarding', active: false }));
    mockGetAll.mockResolvedValue([WF_ACTIVE]);

    const result = await handleManageWorkflows('desativa onboarding');

    expect(mockUpdate).toHaveBeenCalledWith('w1', { is_active: false });
    expect(result).not.toContain('não encontrado');
  });

  test('returns error when workflow not found', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'toggle', name: 'Inexistente', active: false }));
    mockGetAll.mockResolvedValue([WF_ACTIVE]);

    const result = await handleManageWorkflows('desativa workflow inexistente');

    expect(result).toContain('não encontrado');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('returns error when active flag is missing', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'toggle', name: 'Onboarding' }));

    const result = await handleManageWorkflows('toggle onboarding');

    expect(result).toContain('⚠️');
  });
});

// ── edit ──────────────────────────────────────────────────────────────────────

describe('handleManageWorkflows() — edit', () => {
  const NEW_STEPS = [{ step_order: 1, step_type: 'send_message', content: 'Novo passo' }];

  test('deletes old steps and creates new ones', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'edit', name: 'Onboarding', steps: NEW_STEPS }));
    mockGetAll.mockResolvedValue([WF_ACTIVE]);

    const result = await handleManageWorkflows('edita onboarding com novo passo');

    expect(mockDeleteSteps).toHaveBeenCalledWith('w1');
    expect(mockCreateStep).toHaveBeenCalledTimes(1);
    expect(result).toContain('atualizado');
    expect(result).toContain('1 passo');
  });

  test('also updates description when provided', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      operation: 'edit', name: 'Onboarding',
      description: 'Nova descrição', steps: NEW_STEPS,
    }));
    mockGetAll.mockResolvedValue([WF_ACTIVE]);

    await handleManageWorkflows('edita onboarding');

    expect(mockUpdate).toHaveBeenCalledWith('w1', { description: 'Nova descrição' });
  });

  test('returns error when workflow not found', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'edit', name: 'Inexistente', steps: NEW_STEPS }));
    mockGetAll.mockResolvedValue([]);

    const result = await handleManageWorkflows('edita workflow inexistente');

    expect(result).toContain('não encontrado');
    expect(mockDeleteSteps).not.toHaveBeenCalled();
  });

  test('returns error when steps are missing', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'edit', name: 'Onboarding' }));

    const result = await handleManageWorkflows('edita onboarding');

    expect(result).toContain('⚠️');
  });
});

// ── fallback / error handling ─────────────────────────────────────────────────

describe('handleManageWorkflows() — fallback', () => {
  test('returns fallback for unknown operation', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ operation: 'unknown' }));

    const result = await handleManageWorkflows('faça algo aleatório');

    expect(result).toContain('⚠️');
    expect(result).toContain('listar');
  });

  test('returns fallback when LLM call throws', async () => {
    mockChat.mockRejectedValue(new Error('API timeout'));

    const result = await handleManageWorkflows('lista workflows');

    expect(result).toContain('⚠️');
  });

  test('returns fallback when LLM returns malformed JSON', async () => {
    mockChat.mockResolvedValue('texto sem json');

    const result = await handleManageWorkflows('lista workflows');

    expect(result).toContain('⚠️');
  });
});
