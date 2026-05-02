jest.mock('../src/db/workflows', () => ({
  getWorkflowSteps: jest.fn(),
  getInstanceById: jest.fn(),
  createInstance: jest.fn(),
  advanceInstance: jest.fn(),
  completeInstance: jest.fn(),
  cancelInstance: jest.fn(),
}));

jest.mock('../src/workflows/interpolate', () => ({
  interpolate: jest.fn((template: string) => template),
}));

jest.mock('../src/ai/classifier', () => ({
  classify: jest.fn(),
}));

jest.mock('../src/format', () => ({
  formatDemand: jest.fn(() => '🟡 Admissão de Frank — administrativo'),
}));

import {
  triggerWorkflow, advanceAfterConfirmation, answerQuestion, cancelWorkflow,
} from '../src/workflows/engine';
import {
  getWorkflowSteps, getInstanceById, createInstance,
  advanceInstance, completeInstance, cancelInstance,
} from '../src/db/workflows';
import { interpolate } from '../src/workflows/interpolate';
import { classify } from '../src/ai/classifier';
import { formatDemand } from '../src/format';

const mockGetSteps      = jest.mocked(getWorkflowSteps);
const mockGetInstance   = jest.mocked(getInstanceById);
const mockCreate        = jest.mocked(createInstance);
const mockAdvance       = jest.mocked(advanceInstance);
const mockComplete      = jest.mocked(completeInstance);
const mockCancel        = jest.mocked(cancelInstance);
const mockInterpolate   = jest.mocked(interpolate);
const mockClassify      = jest.mocked(classify);
const mockFormatDemand  = jest.mocked(formatDemand);

const INSTANCE = {
  id: 'inst-1',
  workflow_id: 'wf-1',
  sender: '5511999',
  current_step_order: 1,
  variables: { name: 'Frank' },
  status: 'active' as const,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

const STEP_SEND = {
  id: 's1', workflow_id: 'wf-1', step_order: 1,
  step_type: 'send_message', content: 'Bem-vindo, {{name}}!',
};

const STEP_ASK = {
  id: 's2', workflow_id: 'wf-1', step_order: 2,
  step_type: 'ask_question', content: 'Qual é o cargo de {{name}}?',
  variable_name: 'role',
};

const CLASSIFY_RESULT = {
  type: 'new_demand' as const,
  category: 'administrativo' as const,
  priority: 'low' as const,
  summary: 'Admissão de Frank',
  demandIndex: null,
  resolved: false,
  queryFilters: null,
  note: null,
  workflowId: null,
  workflowVariables: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockInterpolate.mockImplementation((t: string) => t);
  mockClassify.mockResolvedValue(CLASSIFY_RESULT);
  mockFormatDemand.mockReturnValue('🟡 Admissão de Frank — administrativo');
});

// ── triggerWorkflow ────────────────────────────────────────────────────────────

describe('triggerWorkflow()', () => {
  test('creates instance and returns send_message for first step', async () => {
    mockCreate.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([STEP_SEND]);

    const result = await triggerWorkflow('wf-1', '5511999', { name: 'Frank' });

    expect(mockCreate).toHaveBeenCalledWith('wf-1', '5511999', { name: 'Frank' });
    expect(result.action).toBe('send_message');
    if (result.action === 'send_message') {
      expect(result.instanceId).toBe('inst-1');
      expect(result.content).toBe('Bem-vindo, {{name}}!');
    }
  });

  test('returns ask_question with instanceId for ask_question first step', async () => {
    mockCreate.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([{ ...STEP_ASK, step_order: 1 }]);

    const result = await triggerWorkflow('wf-1', '5511999', {});

    expect(result.action).toBe('ask_question');
    if (result.action === 'ask_question') {
      expect(result.instanceId).toBe('inst-1');
      expect(result.variableName).toBe('role');
    }
  });

  test('completes immediately if workflow has no steps', async () => {
    mockCreate.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([]);
    mockComplete.mockResolvedValue(undefined);

    const result = await triggerWorkflow('wf-1', '5511999', {});

    expect(result.action).toBe('workflow_complete');
    expect(mockComplete).toHaveBeenCalledWith('inst-1');
  });

  test('returns error for unknown step type', async () => {
    mockCreate.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([
      { id: 's1', workflow_id: 'wf-1', step_order: 1, step_type: 'send_email', content: 'Enviar email para {{name}}' }
    ]);

    const result = await triggerWorkflow('wf-1', '5511999', {});

    expect(result.action).toBe('error');
  });

  test('returns error when ask_question step has no variable_name', async () => {
    mockCreate.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([
      { id: 's1', workflow_id: 'wf-1', step_order: 1, step_type: 'ask_question', content: 'Pergunta sem variável' }
    ]);

    const result = await triggerWorkflow('wf-1', '5511999', {});

    expect(result.action).toBe('error');
    if (result.action === 'error') {
      expect(result.message).toMatch(/variable_name/);
    }
  });

  test('uses interpolate to render content with variables', async () => {
    mockCreate.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([STEP_SEND]);
    mockInterpolate.mockReturnValue('Bem-vindo, Frank!');

    const result = await triggerWorkflow('wf-1', '5511999', { name: 'Frank' });

    expect(mockInterpolate).toHaveBeenCalledWith('Bem-vindo, {{name}}!', { name: 'Frank' });
    if (result.action === 'send_message') {
      expect(result.content).toBe('Bem-vindo, Frank!');
    }
  });
});

// ── advanceAfterConfirmation ───────────────────────────────────────────────────

describe('advanceAfterConfirmation()', () => {
  test('advances to next step and returns its result', async () => {
    mockGetInstance.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([STEP_SEND, STEP_ASK]);
    mockAdvance.mockResolvedValue(undefined);

    const result = await advanceAfterConfirmation('inst-1');

    expect(mockAdvance).toHaveBeenCalledWith('inst-1', 2, { name: 'Frank' });
    expect(result.action).toBe('ask_question');
    if (result.action === 'ask_question') {
      expect(result.variableName).toBe('role');
      expect(result.instanceId).toBe('inst-1');
    }
  });

  test('completes workflow when no next step exists', async () => {
    mockGetInstance.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([STEP_SEND]);
    mockComplete.mockResolvedValue(undefined);

    const result = await advanceAfterConfirmation('inst-1');

    expect(mockComplete).toHaveBeenCalledWith('inst-1');
    expect(result.action).toBe('workflow_complete');
  });

  test('returns error when instance not found', async () => {
    mockGetInstance.mockResolvedValue(null);

    const result = await advanceAfterConfirmation('missing-id');

    expect(result.action).toBe('error');
    if (result.action === 'error') {
      expect(result.message).toMatch(/não encontrada/);
    }
  });
});

// ── answerQuestion ─────────────────────────────────────────────────────────────

describe('answerQuestion()', () => {
  test('stores answer in variables and advances to next step', async () => {
    mockGetInstance.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([STEP_SEND, STEP_ASK]);
    mockAdvance.mockResolvedValue(undefined);
    // executeStep for step 2 (ask_question at order 2)
    // After answerQuestion, we advance to step 2 and call executeStep
    // But INSTANCE.current_step_order is 1, so we look for step_order 1 first
    // then advance to 2 and execute step 2

    const instanceAtStep1 = { ...INSTANCE, current_step_order: 1 };
    mockGetInstance.mockResolvedValue(instanceAtStep1);
    // Steps: step 1 = send_message, step 2 = ask_question
    // current step is 1 (send_message) - it has no variable_name, so answerQuestion should fail
    // Let's use a proper setup: current step is 1 which IS an ask_question
    const askStep1 = { ...STEP_ASK, step_order: 1 };
    mockGetSteps.mockResolvedValue([askStep1, { ...STEP_SEND, step_order: 2 }]);

    const result = await answerQuestion('inst-1', 'Técnico de Enfermagem');

    const expectedVars = { name: 'Frank', role: 'Técnico de Enfermagem' };
    expect(mockAdvance).toHaveBeenCalledWith('inst-1', 2, expectedVars);
    expect(result.action).toBe('send_message');
    if (result.action === 'send_message') {
      expect(result.instanceId).toBe('inst-1');
    }
  });

  test('completes workflow when answered step is the last one', async () => {
    const instanceAtStep1 = { ...INSTANCE, current_step_order: 1 };
    mockGetInstance.mockResolvedValue(instanceAtStep1);
    mockGetSteps.mockResolvedValue([{ ...STEP_ASK, step_order: 1 }]);
    mockAdvance.mockResolvedValue(undefined);
    mockComplete.mockResolvedValue(undefined);

    const result = await answerQuestion('inst-1', 'Técnico');

    expect(mockAdvance).toHaveBeenCalledWith('inst-1', 2, expect.objectContaining({ role: 'Técnico' }));
    expect(mockComplete).toHaveBeenCalledWith('inst-1');
    expect(result.action).toBe('workflow_complete');
  });

  test('returns error when current step has no variable_name', async () => {
    mockGetInstance.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([{ ...STEP_SEND, step_order: 1 }]); // send_message has no variable_name

    const result = await answerQuestion('inst-1', 'alguma resposta');

    expect(result.action).toBe('error');
    if (result.action === 'error') {
      expect(result.message).toMatch(/variável/);
    }
  });

  test('returns error when instance not found', async () => {
    mockGetInstance.mockResolvedValue(null);

    const result = await answerQuestion('missing', 'resposta');

    expect(result.action).toBe('error');
  });
});

// ── create_demand step ─────────────────────────────────────────────────────────

describe('triggerWorkflow() — create_demand step', () => {
  const STEP_DEMAND = {
    id: 's1', workflow_id: 'wf-1', step_order: 1,
    step_type: 'create_demand', content: 'Registrar admissão de {{name}}',
  };

  test('classifies content and returns confirm_demand with workflow_save_demand action', async () => {
    mockCreate.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([STEP_DEMAND]);

    const result = await triggerWorkflow('wf-1', '5511999', { name: 'Frank' });

    expect(mockClassify).toHaveBeenCalledWith('Registrar admissão de {{name}}');
    expect(result.action).toBe('confirm_demand');
    if (result.action === 'confirm_demand') {
      expect(result.pendingAction.type).toBe('workflow_save_demand');
      if (result.pendingAction.type === 'workflow_save_demand') {
        expect(result.pendingAction.instanceId).toBe('inst-1');
        expect(result.pendingAction.demand.summary).toBe('Admissão de Frank');
        expect(result.pendingAction.demand.category).toBe('administrativo');
        expect(result.pendingAction.demand.priority).toBe('low');
      }
      expect(result.confirmPrompt).toContain('Vou registrar');
    }
  });

  test('uses formatDemand to build the confirmation prompt', async () => {
    mockCreate.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([STEP_DEMAND]);
    mockFormatDemand.mockReturnValue('🟡 Admissão de Frank — administrativo');

    const result = await triggerWorkflow('wf-1', '5511999', { name: 'Frank' });

    expect(mockFormatDemand).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Admissão de Frank' }),
      { showCategory: true }
    );
    if (result.action === 'confirm_demand') {
      expect(result.confirmPrompt).toContain('🟡 Admissão de Frank — administrativo');
    }
  });
});

// ── create_notification step ───────────────────────────────────────────────────

describe('triggerWorkflow() — create_notification step', () => {
  const STEP_NOTIF = {
    id: 's1', workflow_id: 'wf-1', step_order: 1,
    step_type: 'create_notification', content: 'Lembrete: reunião às 14h',
  };

  test('returns confirm_notification with create_notification action', async () => {
    mockCreate.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([STEP_NOTIF]);

    const result = await triggerWorkflow('wf-1', '5511999', {});

    expect(result.action).toBe('confirm_notification');
    if (result.action === 'confirm_notification') {
      expect(result.pendingAction.type).toBe('create_notification');
      if (result.pendingAction.type === 'create_notification') {
        expect(result.pendingAction.instanceId).toBe('inst-1');
        expect(result.pendingAction.recipient).toBe('5511999');
        expect(result.pendingAction.content).toBe('Lembrete: reunião às 14h');
      }
      expect(result.confirmPrompt).toContain('Vou criar esta notificação');
      expect(result.confirmPrompt).toContain('Lembrete: reunião às 14h');
    }
  });

  test('truncates long content in notificationSummary', async () => {
    const longContent = 'A'.repeat(100);
    mockCreate.mockResolvedValue(INSTANCE);
    mockGetSteps.mockResolvedValue([{ ...STEP_NOTIF, content: longContent }]);
    mockInterpolate.mockReturnValue(longContent);

    const result = await triggerWorkflow('wf-1', '5511999', {});

    if (result.action === 'confirm_notification' && result.pendingAction.type === 'create_notification') {
      expect(result.pendingAction.notificationSummary.length).toBeLessThanOrEqual(80);
    }
  });
});

// ── cancelWorkflow ─────────────────────────────────────────────────────────────

describe('cancelWorkflow()', () => {
  test('cancels the instance and returns workflow_cancelled', async () => {
    mockCancel.mockResolvedValue(undefined);

    const result = await cancelWorkflow('inst-1');

    expect(mockCancel).toHaveBeenCalledWith('inst-1');
    expect(result.action).toBe('workflow_cancelled');
  });
});
