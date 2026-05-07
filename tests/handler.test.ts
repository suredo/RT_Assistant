/**
 * Unit tests for src/whatsapp/handler.ts — all dependencies mocked.
 * Covers every routing branch: active workflow, pending actions (all types),
 * keyword pre-check, classify-based routing, role-based prompt selection.
 */

// ── Mocks (must be declared before imports) ───────────────────────────────────

jest.mock('../src/ai/glm', () => ({
  reply:          jest.fn(),
  SYSTEM_PROMPT:  'SYSTEM_PROMPT',
  DISCUSS_PROMPT: 'DISCUSS_PROMPT',
  TEAM_PROMPT:    'TEAM_PROMPT',
}));

jest.mock('../src/ai/classifier', () => ({
  classify:     jest.fn(),
  mergeSummary: jest.fn(),
}));

jest.mock('../src/ai/context', () => ({
  getHistory:          jest.fn(),
  addTurn:             jest.fn(),
  clearHistory:        jest.fn(),
  getPendingAction:    jest.fn(),
  setPendingAction:    jest.fn(),
  clearPendingAction:  jest.fn(),
  isConfirmation:      jest.fn(),
  isRejection:         jest.fn(),
  setActiveWorkflow:   jest.fn(),
  getActiveWorkflow:   jest.fn(),
  clearActiveWorkflow: jest.fn(),
  hasBeenGreeted:      jest.fn(),
  markGreeted:         jest.fn(),
}));

jest.mock('../src/help', () => ({
  formatHelp:    jest.fn().mockReturnValue('[help content]'),
  formatWelcome: jest.fn().mockReturnValue('[welcome]'),
}));

jest.mock('../src/db/supabase', () => ({
  saveDemand:     jest.fn(),
  updateDemand:   jest.fn(),
  resolveDemand:  jest.fn(),
  appendNote:     jest.fn(),
  getOpenDemands: jest.fn(),
  getDemands:     jest.fn(),
}));

jest.mock('../src/db/workflows', () => ({
  getActiveWorkflows:  jest.fn(),
  getWorkflowSteps:    jest.fn(),
  createNotification:  jest.fn(),
}));

jest.mock('../src/workflows/engine', () => ({
  triggerWorkflow:           jest.fn(),
  advanceAfterConfirmation:  jest.fn(),
  answerQuestion:            jest.fn(),
  cancelWorkflow:            jest.fn(),
  getResumableInstance:      jest.fn(),
}));

jest.mock('../src/workflows/manager', () => ({
  handleManageWorkflows:  jest.fn(),
  executeManageCommand:   jest.fn(),
  modifyManageCommand:    jest.fn(),
}));

jest.mock('../src/format', () => ({
  formatDemand:  jest.fn(() => '[demand preview]'),
  noteTimestamp: jest.fn(() => '[2026-05-06]'),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { handleMessage } from '../src/whatsapp/handler';
import { reply, SYSTEM_PROMPT, DISCUSS_PROMPT, TEAM_PROMPT } from '../src/ai/glm';
import { classify, mergeSummary } from '../src/ai/classifier';
import {
  getActiveWorkflow, setActiveWorkflow, clearActiveWorkflow,
  getPendingAction, setPendingAction, clearPendingAction,
  isConfirmation, isRejection,
  getHistory,
  hasBeenGreeted, markGreeted,
} from '../src/ai/context';
import { formatHelp, formatWelcome } from '../src/help';
import { getOpenDemands, getDemands } from '../src/db/supabase';
import { getActiveWorkflows, getWorkflowSteps } from '../src/db/workflows';
import {
  triggerWorkflow, answerQuestion, cancelWorkflow,
  getResumableInstance, advanceAfterConfirmation,
} from '../src/workflows/engine';
import {
  handleManageWorkflows, executeManageCommand, modifyManageCommand,
} from '../src/workflows/manager';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockReply                = jest.mocked(reply);
const mockClassify             = jest.mocked(classify);
const mockMergeSummary         = jest.mocked(mergeSummary);
const mockGetActiveWorkflow    = jest.mocked(getActiveWorkflow);
const mockSetActiveWorkflow    = jest.mocked(setActiveWorkflow);
const mockClearActiveWorkflow  = jest.mocked(clearActiveWorkflow);
const mockGetPendingAction     = jest.mocked(getPendingAction);
const mockSetPendingAction     = jest.mocked(setPendingAction);
const mockClearPendingAction   = jest.mocked(clearPendingAction);
const mockIsConfirmation       = jest.mocked(isConfirmation);
const mockIsRejection          = jest.mocked(isRejection);
const mockGetHistory           = jest.mocked(getHistory);
const mockGetOpenDemands            = jest.mocked(getOpenDemands);
const mockGetDemands                = jest.mocked(getDemands);
const mockGetActiveWorkflows        = jest.mocked(getActiveWorkflows);
const mockGetWorkflowSteps          = jest.mocked(getWorkflowSteps);
const mockTriggerWorkflow      = jest.mocked(triggerWorkflow);
const mockAnswerQuestion       = jest.mocked(answerQuestion);
const mockCancelWorkflow       = jest.mocked(cancelWorkflow);
const mockGetResumableInstance = jest.mocked(getResumableInstance);
const mockAdvanceAfter         = jest.mocked(advanceAfterConfirmation);
const mockHandleManage         = jest.mocked(handleManageWorkflows);
const mockExecuteManage        = jest.mocked(executeManageCommand);
const mockModifyManage         = jest.mocked(modifyManageCommand);
const mockHasBeenGreeted       = jest.mocked(hasBeenGreeted);
const mockMarkGreeted          = jest.mocked(markGreeted);
// formatHelp / formatWelcome are static mocks; just reference for assertions
jest.mocked(formatHelp);
jest.mocked(formatWelcome);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SENDER   = '5511999999999';
const BODY     = 'test message';
const INSTANCE = 'instance-uuid-1';

const DEFAULT_CLASSIFICATION = {
  type:                    'other'   as const,
  category:                'rotina'  as const,
  priority:                'low'     as const,
  summary:                 'test',
  demandIndex:             null,
  resolved:                false,
  queryFilters:            null,
  note:                    null,
  workflowId:              null,
  workflowVariables:       null,
  notificationContent:     null,
  notificationScheduledAt: null,
};

const STEP_COMPLETE = { action: 'workflow_complete' as const, summary: 'Workflow concluído' };

const OPEN_DEMAND = {
  id: 'd-1',
  message: 'Falta de EPI',
  summary: 'Falta de EPI no estoque',
  category: 'administrativo' as const,
  priority: 'medium' as const,
  status: 'open' as const,
  created_at: new Date().toISOString(),
  notes: undefined,
  resolved_at: undefined,
  whatsapp_message_id: undefined,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

let captured: string[];
let sendFn: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();

  captured = [];
  sendFn   = jest.fn(async (msg: string) => { captured.push(msg); });

  // Default: already greeted — keeps existing tests unaffected by onboarding
  mockHasBeenGreeted.mockReturnValue(true);

  // Default: idle state — no active workflow, no pending action
  mockGetActiveWorkflow.mockReturnValue(null);
  mockGetPendingAction.mockReturnValue(null);
  mockGetResumableInstance.mockResolvedValue(null);
  mockIsConfirmation.mockReturnValue(false);
  mockIsRejection.mockReturnValue(false);
  mockGetHistory.mockReturnValue([]);
  mockGetOpenDemands.mockResolvedValue([]);
  mockGetDemands.mockResolvedValue([]);
  mockGetActiveWorkflows.mockResolvedValue([]);
  mockGetWorkflowSteps.mockResolvedValue([]);
  mockClassify.mockResolvedValue(DEFAULT_CLASSIFICATION);
  mockMergeSummary.mockResolvedValue('Resumo mesclado');
  mockReply.mockResolvedValue('Resposta do bot');
  mockHandleManage.mockResolvedValue({ type: 'immediate', response: 'OK' });
  mockExecuteManage.mockResolvedValue('Workflow criado com sucesso');
  mockModifyManage.mockResolvedValue({
    type: 'preview', preview: 'Nova prévia', cmd: {
      operation: 'create', name: 'Test', description: 'G',
      steps: [{ step_order: 1, step_type: 'ask_question', content: 'Pergunta?' }],
    },
  });
  mockTriggerWorkflow.mockResolvedValue(STEP_COMPLETE);
  mockAnswerQuestion.mockResolvedValue(STEP_COMPLETE);
  mockCancelWorkflow.mockResolvedValue(undefined as never);
  mockAdvanceAfter.mockResolvedValue(STEP_COMPLETE);
});

// ── Active workflow branch ─────────────────────────────────────────────────────

describe('active workflow', () => {
  test('routes all messages to answerQuestion — cancellation is handled by the engine', async () => {
    mockGetActiveWorkflow.mockReturnValue(INSTANCE);

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockAnswerQuestion).toHaveBeenCalledWith(INSTANCE, BODY);
  });

  test('workflow_cancelled result from engine clears active workflow and sends cancellation message', async () => {
    mockGetActiveWorkflow.mockReturnValue(INSTANCE);
    mockAnswerQuestion.mockResolvedValue({ action: 'workflow_cancelled' });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockClearActiveWorkflow).toHaveBeenCalledWith(SENDER);
    expect(captured[0]).toMatch(/cancelado/i);
  });

  test('workflow_unclear result keeps active workflow and sends clarification prompt', async () => {
    mockGetActiveWorkflow.mockReturnValue(INSTANCE);
    mockAnswerQuestion.mockResolvedValue({
      action: 'workflow_unclear',
      prompt: 'Não consegui interpretar. Pergunta: Qual o nome?',
      instanceId: INSTANCE,
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockSetActiveWorkflow).toHaveBeenCalledWith(SENDER, INSTANCE);
    expect(captured[0]).toMatch(/Não consegui interpretar/i);
  });

  test('ask_question result sets active workflow and sends the prompt', async () => {
    mockGetActiveWorkflow.mockReturnValue(INSTANCE);
    mockAnswerQuestion.mockResolvedValue({
      action: 'ask_question', prompt: 'Qual o cargo?', variableName: 'cargo', instanceId: INSTANCE,
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockSetActiveWorkflow).toHaveBeenCalledWith(SENDER, INSTANCE);
    expect(captured).toContain('Qual o cargo?');
  });

  test('lazy rehydration: finds resumable instance, sets active, routes to answerQuestion', async () => {
    // No active in-memory, no pending — should try to resume from DB
    mockGetActiveWorkflow.mockReturnValue(null);
    mockGetPendingAction.mockReturnValue(null);
    mockGetResumableInstance.mockResolvedValue({ id: INSTANCE } as never);

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockSetActiveWorkflow).toHaveBeenCalledWith(SENDER, INSTANCE);
    expect(mockAnswerQuestion).toHaveBeenCalledWith(INSTANCE, BODY);
  });
});

// ── Pending action branch ─────────────────────────────────────────────────────

describe('pending action', () => {
  test('suggest_workflow + body starting with "workflow" clears pending and starts workflow creation', async () => {
    mockGetPendingAction.mockReturnValue({
      type: 'suggest_workflow',
      originalMessage: 'processo de contratação',
      demand: { message: 'msg', summary: 'sum', category: 'rotina', priority: 'low' },
    } as never);

    await handleMessage('workflow criar agora', SENDER, 'rt', sendFn);

    expect(mockClearPendingAction).toHaveBeenCalledWith(SENDER);
    expect(mockHandleManage).toHaveBeenCalled();
    expect(captured[0]).toBe('OK');
  });

  test('confirmation executes pending save action and sends ✅ Feito!', async () => {
    mockGetPendingAction.mockReturnValue({
      type: 'save',
      demand: { message: BODY, summary: 'Resumo', category: 'rotina', priority: 'low' },
      messageId: '',
    } as never);
    mockIsConfirmation.mockReturnValue(true);

    const { saveDemand } = jest.requireMock('../src/db/supabase');
    saveDemand.mockResolvedValue({});

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(saveDemand).toHaveBeenCalled();
    expect(mockClearPendingAction).toHaveBeenCalledWith(SENDER);
    expect(captured).toContain('✅ Feito!');
  });

  test('confirmation of workflow_create calls executeManageCommand, no ✅ Feito! added by handler', async () => {
    mockGetPendingAction.mockReturnValue({
      type: 'workflow_create',
      workflowName: 'Onboarding',
      description: 'Gatilho',
      steps: [{ step_order: 1, step_type: 'ask_question', content: 'Cargo?' }],
    } as never);
    mockIsConfirmation.mockReturnValue(true);

    await handleMessage('sim', SENDER, 'rt', sendFn);

    expect(mockExecuteManage).toHaveBeenCalledWith(expect.objectContaining({ operation: 'create', name: 'Onboarding' }));
    expect(captured).toContain('Workflow criado com sucesso');
    expect(captured).not.toContain('✅ Feito!');
  });

  test('rejection clears pending action and sends cancellation message', async () => {
    mockGetPendingAction.mockReturnValue({ type: 'save', demand: {}, messageId: '' } as never);
    mockIsRejection.mockReturnValue(true);

    await handleMessage('não', SENDER, 'rt', sendFn);

    expect(mockClearPendingAction).toHaveBeenCalledWith(SENDER);
    expect(captured[0]).toMatch(/cancelado/i);
  });

  test('workflow_create pending + tweak body calls modifyManageCommand and re-stages preview', async () => {
    const pendingSteps = [{ step_order: 1, step_type: 'ask_question', content: 'Cargo e justificativa?' }];
    mockGetPendingAction.mockReturnValue({
      type: 'workflow_create',
      workflowName: 'Contratação',
      description: 'Gatilho',
      steps: pendingSteps,
    } as never);
    // Not confirmation or rejection
    mockIsConfirmation.mockReturnValue(false);
    mockIsRejection.mockReturnValue(false);

    await handleMessage('retire a justificativa', SENDER, 'rt', sendFn);

    expect(mockModifyManage).toHaveBeenCalledWith(
      'retire a justificativa',
      expect.objectContaining({ operation: 'create', name: 'Contratação' }),
    );
    expect(mockSetPendingAction).toHaveBeenCalledWith(SENDER, expect.objectContaining({ type: 'workflow_create' }));
    expect(captured[0]).toBe('Nova prévia');
  });

  test('workflow_create tweak returning immediate error clears pending', async () => {
    mockGetPendingAction.mockReturnValue({
      type: 'workflow_create',
      workflowName: 'Test',
      description: 'G',
      steps: [],
    } as never);
    mockIsConfirmation.mockReturnValue(false);
    mockIsRejection.mockReturnValue(false);
    mockModifyManage.mockResolvedValue({ type: 'immediate', response: '⚠️ Não consegui aplicar' });

    await handleMessage('algo confuso', SENDER, 'rt', sendFn);

    expect(mockClearPendingAction).toHaveBeenCalledWith(SENDER);
    expect(captured[0]).toBe('⚠️ Não consegui aplicar');
  });

  test('workflow_edit pending + tweak passes operation:edit to modifyManageCommand', async () => {
    mockGetPendingAction.mockReturnValue({
      type: 'workflow_edit',
      workflowName: 'Onboarding',
      description: 'Gatilho',
      steps: [{ step_order: 1, step_type: 'send_message', content: 'Mensagem' }],
    } as never);
    mockIsConfirmation.mockReturnValue(false);
    mockIsRejection.mockReturnValue(false);

    await handleMessage('muda o step 1', SENDER, 'rt', sendFn);

    expect(mockModifyManage).toHaveBeenCalledWith(
      'muda o step 1',
      expect.objectContaining({ operation: 'edit' }),
    );
  });

  test('unrelated message with non-workflow pending clears pending and falls through to classify', async () => {
    mockGetPendingAction.mockReturnValue({ type: 'save', demand: {}, messageId: '' } as never);
    mockIsConfirmation.mockReturnValue(false);
    mockIsRejection.mockReturnValue(false);

    await handleMessage('qual é o tempo hoje?', SENDER, 'rt', sendFn);

    expect(mockClearPendingAction).toHaveBeenCalledWith(SENDER);
    // Falls through to LLM reply
    expect(mockReply).toHaveBeenCalled();
  });
});

// ── Keyword pre-check ─────────────────────────────────────────────────────────

describe('keyword pre-check (isWorkflowManagementMessage)', () => {
  test('message containing "workflow" + management verb bypasses classify', async () => {
    await handleMessage('crie um novo workflow de onboarding', SENDER, 'rt', sendFn);

    expect(mockHandleManage).toHaveBeenCalledWith('crie um novo workflow de onboarding');
    expect(mockClassify).not.toHaveBeenCalled();
    expect(captured[0]).toBe('OK');
  });

  test('message with "workflow" but no management verb falls through to classify', async () => {
    await handleMessage('o workflow está funcionando bem', SENDER, 'rt', sendFn);

    expect(mockClassify).toHaveBeenCalled();
  });
});

// ── Classification routing ────────────────────────────────────────────────────

describe('classify → trigger_workflow', () => {
  test('calls triggerWorkflow with workflowId and variables', async () => {
    mockClassify.mockResolvedValue({
      ...DEFAULT_CLASSIFICATION,
      type: 'trigger_workflow',
      workflowId: 'wf-123',
      workflowVariables: { name: 'Frank' },
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockTriggerWorkflow).toHaveBeenCalledWith('wf-123', SENDER, { name: 'Frank' });
  });
});

describe('classify → manage_workflows', () => {
  test('calls handleManageWorkflows', async () => {
    mockClassify.mockResolvedValue({ ...DEFAULT_CLASSIFICATION, type: 'manage_workflows' });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockHandleManage).toHaveBeenCalledWith(BODY);
    expect(mockTriggerWorkflow).not.toHaveBeenCalled();
  });
});

describe('classify → new_demand', () => {
  test('stages a save action and sends confirmation prompt', async () => {
    mockClassify.mockResolvedValue({
      ...DEFAULT_CLASSIFICATION,
      type: 'new_demand',
      summary: 'Falta de EPI',
      category: 'administrativo',
      priority: 'medium',
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockSetPendingAction).toHaveBeenCalledWith(
      SENDER,
      expect.objectContaining({ type: 'save' }),
    );
    // Confirmation prompt always contains (sim/não)
    expect(captured[0]).toContain('(sim/não)');
  });
});

describe('classify → suggest_workflow', () => {
  test('stages suggest_workflow action and sends the demand-or-workflow choice message', async () => {
    mockClassify.mockResolvedValue({
      ...DEFAULT_CLASSIFICATION,
      type: 'suggest_workflow',
      summary: 'Processo de contratação recorrente',
      category: 'gestão de equipe',
      priority: 'medium',
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockSetPendingAction).toHaveBeenCalledWith(
      SENDER,
      expect.objectContaining({ type: 'suggest_workflow' }),
    );
    expect(captured[0]).toMatch(/workflow|automatizar/i);
    expect(captured[0]).toMatch(/registrar|demanda/i);
  });
});

describe('classify → update (resolved)', () => {
  test('stages a resolve action when demandIndex references a known open demand', async () => {
    mockGetOpenDemands.mockResolvedValue([OPEN_DEMAND]);
    mockClassify.mockResolvedValue({
      ...DEFAULT_CLASSIFICATION,
      type: 'update',
      demandIndex: 1,
      resolved: true,
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockSetPendingAction).toHaveBeenCalledWith(
      SENDER,
      expect.objectContaining({ type: 'resolve', demandId: 'd-1' }),
    );
  });
});

describe('classify → update (not resolved)', () => {
  test('calls mergeSummary and stages an update action', async () => {
    mockGetOpenDemands.mockResolvedValue([OPEN_DEMAND]);
    mockClassify.mockResolvedValue({
      ...DEFAULT_CLASSIFICATION,
      type: 'update',
      demandIndex: 1,
      resolved: false,
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockMergeSummary).toHaveBeenCalledWith(OPEN_DEMAND.summary, BODY);
    expect(mockSetPendingAction).toHaveBeenCalledWith(
      SENDER,
      expect.objectContaining({ type: 'update', demandId: 'd-1' }),
    );
  });
});

describe('classify → add_note', () => {
  test('stages an add_note action with the extracted note text', async () => {
    mockGetOpenDemands.mockResolvedValue([OPEN_DEMAND]);
    mockClassify.mockResolvedValue({
      ...DEFAULT_CLASSIFICATION,
      type: 'add_note',
      demandIndex: 1,
      note: 'Técnico acionado, aguardando visita',
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockSetPendingAction).toHaveBeenCalledWith(
      SENDER,
      expect.objectContaining({ type: 'add_note', demandId: 'd-1' }),
    );
    expect(captured[0]).toContain('(sim/não)');
  });
});

describe('classify → discuss', () => {
  test('uses DISCUSS_PROMPT for the LLM reply', async () => {
    mockClassify.mockResolvedValue({ ...DEFAULT_CLASSIFICATION, type: 'discuss' });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockReply).toHaveBeenCalledWith(BODY, expect.any(Array), DISCUSS_PROMPT);
  });
});

describe('classify → other', () => {
  test('uses SYSTEM_PROMPT for the LLM reply', async () => {
    mockClassify.mockResolvedValue({ ...DEFAULT_CLASSIFICATION, type: 'other' });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockReply).toHaveBeenCalledWith(BODY, expect.any(Array), SYSTEM_PROMPT);
  });
});

// ── Role-based routing ────────────────────────────────────────────────────────

describe('role=team', () => {
  test('always uses TEAM_PROMPT for the LLM reply regardless of classification', async () => {
    mockClassify.mockResolvedValue({ ...DEFAULT_CLASSIFICATION, type: 'discuss' });

    await handleMessage(BODY, SENDER, 'team', sendFn);

    expect(mockReply).toHaveBeenCalledWith(BODY, expect.any(Array), TEAM_PROMPT);
  });

  test('does not fetch open demands for team role', async () => {
    await handleMessage(BODY, SENDER, 'team', sendFn);

    expect(mockGetOpenDemands).not.toHaveBeenCalled();
  });
});

// ── Help intent ───────────────────────────────────────────────────────────────

describe('help intent', () => {
  test('sends formatted help content and returns', async () => {
    mockClassify.mockResolvedValue({ ...DEFAULT_CLASSIFICATION, type: 'help' as never });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(captured[0]).toBe('[help content]');
    expect(mockReply).not.toHaveBeenCalled();
  });

  test('passes role to formatHelp', async () => {
    mockClassify.mockResolvedValue({ ...DEFAULT_CLASSIFICATION, type: 'help' as never });

    await handleMessage(BODY, SENDER, 'team', sendFn);

    const { formatHelp: fh } = jest.requireMock('../src/help');
    expect(fh).toHaveBeenCalledWith('team');
  });
});

// ── Standalone notification intent ────────────────────────────────────────────

describe('create_notification intent', () => {
  test('stages create_notification PendingAction and sends confirmation', async () => {
    mockClassify.mockResolvedValue({
      ...DEFAULT_CLASSIFICATION,
      type: 'create_notification' as never,
      notificationContent: 'Verificar equipamentos',
      notificationScheduledAt: null,
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockSetPendingAction).toHaveBeenCalledWith(
      SENDER,
      expect.objectContaining({ type: 'create_notification', instanceId: null, recipient: SENDER }),
    );
    expect(captured[0]).toContain('(sim/não)');
    expect(captured[0]).toContain('Verificar equipamentos');
  });

  test('falls back to body when notificationContent is null', async () => {
    mockClassify.mockResolvedValue({
      ...DEFAULT_CLASSIFICATION,
      type: 'create_notification' as never,
      notificationContent: null,
      notificationScheduledAt: null,
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockSetPendingAction).toHaveBeenCalledWith(
      SENDER,
      expect.objectContaining({ content: BODY }),
    );
  });

  test('includes scheduledAt in PendingAction when provided', async () => {
    const isoTime = '2026-05-08T09:00:00';
    mockClassify.mockResolvedValue({
      ...DEFAULT_CLASSIFICATION,
      type: 'create_notification' as never,
      notificationContent: 'Reunião de equipe',
      notificationScheduledAt: isoTime,
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockSetPendingAction).toHaveBeenCalledWith(
      SENDER,
      expect.objectContaining({ scheduledAt: isoTime }),
    );
  });

  test('replaces demand-related content with the actual formatted demand list', async () => {
    mockGetOpenDemands.mockResolvedValue([OPEN_DEMAND]);
    mockClassify.mockResolvedValue({
      ...DEFAULT_CLASSIFICATION,
      type: 'create_notification' as never,
      notificationContent: 'todas as pendências em aberto',
      notificationScheduledAt: null,
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    const staged = mockSetPendingAction.mock.calls[0][1] as { content: string };
    expect(staged.content).toContain('📋 Pendências em aberto:');
    expect(staged.content).toContain('[demand preview]');
  });

  test('uses empty-demands message when demand-related notification has no open demands', async () => {
    mockGetOpenDemands.mockResolvedValue([]);
    mockClassify.mockResolvedValue({
      ...DEFAULT_CLASSIFICATION,
      type: 'create_notification' as never,
      notificationContent: 'todas as pendências',
      notificationScheduledAt: null,
    });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    const staged = mockSetPendingAction.mock.calls[0][1] as { content: string };
    expect(staged.content).toContain('Nenhuma pendência em aberto');
  });
});

// ── Onboarding welcome ────────────────────────────────────────────────────────

describe('onboarding welcome', () => {
  test('sends only the welcome when first message is conversational (other/discuss)', async () => {
    mockHasBeenGreeted.mockReturnValue(false);
    mockClassify.mockResolvedValue({ ...DEFAULT_CLASSIFICATION, type: 'other' });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockMarkGreeted).toHaveBeenCalledWith(SENDER);
    expect(captured[0]).toBe('[welcome]');
    // welcome is the only reply — no second LLM greeting
    expect(captured.length).toBe(1);
  });

  test('sends welcome AND still processes when first message has actionable content', async () => {
    mockHasBeenGreeted.mockReturnValue(false);
    mockClassify.mockResolvedValue({ ...DEFAULT_CLASSIFICATION, type: 'query' });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(captured[0]).toBe('[welcome]');
    // query type falls through to LLM — second message is the LLM answer
    expect(captured.length).toBeGreaterThan(1);
  });

  test('does not send welcome when sender already greeted', async () => {
    mockHasBeenGreeted.mockReturnValue(true);
    mockClassify.mockResolvedValue({ ...DEFAULT_CLASSIFICATION, type: 'other' });

    await handleMessage(BODY, SENDER, 'rt', sendFn);

    expect(mockMarkGreeted).not.toHaveBeenCalled();
    expect(captured[0]).not.toBe('[welcome]');
  });

  test('passes role to formatWelcome', async () => {
    mockHasBeenGreeted.mockReturnValue(false);
    mockClassify.mockResolvedValue({ ...DEFAULT_CLASSIFICATION, type: 'other' });

    await handleMessage(BODY, SENDER, 'team', sendFn);

    const { formatWelcome: fw } = jest.requireMock('../src/help');
    expect(fw).toHaveBeenCalledWith('team');
  });
});
