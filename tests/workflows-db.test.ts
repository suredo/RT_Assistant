const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
const mockOr = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockSingle = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      upsert: mockUpsert,
      delete: mockDelete,
      eq: mockEq,
      or: mockOr,
      order: mockOrder,
      limit: mockLimit,
      single: mockSingle,
    })
  })
}));

import {
  getActiveWorkflows, getAllWorkflows, getWorkflowById, createWorkflow, updateWorkflow,
  getWorkflowSteps, createWorkflowStep, deleteWorkflowSteps,
  getTemplates, getTemplateByName, getTemplateById, createTemplate, updateTemplate, upsertTemplate,
  getInstanceById, getActiveInstance, createInstance, advanceInstance, completeInstance, cancelInstance,
  createNotification, getPendingNotifications, markNotificationSent, cancelNotification,
} from '../src/db/workflows';

const chain = (result: unknown) => {
  const obj: Record<string, jest.Mock> = {};
  const methods = ['select','insert','update','upsert','delete','eq','or','order','limit','single'];
  methods.forEach(m => { obj[m] = jest.fn().mockReturnValue(obj); });
  obj['single'] = jest.fn().mockResolvedValue(result);
  obj['order'] = jest.fn().mockReturnValue(obj);
  obj['limit'] = jest.fn().mockReturnValue(obj);
  obj['eq'] = jest.fn().mockReturnValue(obj);
  obj['or'] = jest.fn().mockReturnValue(obj);
  return obj;
};

beforeEach(() => jest.clearAllMocks());

// ── Workflows ──────────────────────────────────────────────────────────────────

describe('getActiveWorkflows()', () => {
  test('returns list of active workflows', async () => {
    const rows = [{ id: 'w1', name: 'Onboarding', description: 'Contratação', is_active: true }];
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: rows, error: null }) }) });
    const result = await getActiveWorkflows();
    expect(result).toEqual(rows);
  });

  test('returns empty array when no active workflows', async () => {
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: null, error: null }) }) });
    expect(await getActiveWorkflows()).toEqual([]);
  });

  test('throws on error', async () => {
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: null, error: new Error('DB error') }) }) });
    await expect(getActiveWorkflows()).rejects.toThrow('DB error');
  });
});

describe('getAllWorkflows()', () => {
  test('returns all workflows regardless of is_active status', async () => {
    const rows = [
      { id: 'w1', name: 'Active WF', is_active: true },
      { id: 'w2', name: 'Inactive WF', is_active: false },
    ];
    mockSelect.mockReturnValue({ order: jest.fn().mockResolvedValue({ data: rows, error: null }) });
    expect(await getAllWorkflows()).toEqual(rows);
  });

  test('returns empty array when table is empty', async () => {
    mockSelect.mockReturnValue({ order: jest.fn().mockResolvedValue({ data: null, error: null }) });
    expect(await getAllWorkflows()).toEqual([]);
  });

  test('throws on error', async () => {
    mockSelect.mockReturnValue({ order: jest.fn().mockResolvedValue({ data: null, error: new Error('DB error') }) });
    await expect(getAllWorkflows()).rejects.toThrow('DB error');
  });
});

describe('createWorkflow()', () => {
  test('inserts and returns new workflow', async () => {
    const row = { id: 'w1', name: 'Test', description: 'Desc', is_active: true, created_at: '2026-05-01T00:00:00Z' };
    mockInsert.mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: row, error: null }) }) });
    expect(await createWorkflow('Test', 'Desc')).toEqual(row);
  });

  test('throws on insert error', async () => {
    mockInsert.mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null, error: new Error('Insert failed') }) }) });
    await expect(createWorkflow('Test', 'Desc')).rejects.toThrow('Insert failed');
  });
});

describe('updateWorkflow()', () => {
  test('updates workflow fields', async () => {
    mockUpdate.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    await expect(updateWorkflow('w1', { is_active: false })).resolves.toBeUndefined();
  });

  test('throws on update error', async () => {
    mockUpdate.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: new Error('Update failed') }) });
    await expect(updateWorkflow('w1', { is_active: false })).rejects.toThrow('Update failed');
  });
});

// ── Workflow Steps ─────────────────────────────────────────────────────────────

describe('getWorkflowSteps()', () => {
  test('returns steps ordered by step_order', async () => {
    const steps = [
      { id: 's1', workflow_id: 'w1', step_order: 1, step_type: 'send_message', content: 'Olá' },
      { id: 's2', workflow_id: 'w1', step_order: 2, step_type: 'ask_question', content: 'Nome?', variable_name: 'name' },
    ];
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: steps, error: null }) }) });
    expect(await getWorkflowSteps('w1')).toEqual(steps);
  });
});

describe('deleteWorkflowSteps()', () => {
  test('deletes all steps for a workflow', async () => {
    mockDelete.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    await expect(deleteWorkflowSteps('w1')).resolves.toBeUndefined();
  });
});

// ── Instances ──────────────────────────────────────────────────────────────────

describe('getInstanceById()', () => {
  test('returns instance by id', async () => {
    const instance = { id: 'i1', workflow_id: 'w1', sender: '5511999', current_step_order: 2, variables: { name: 'Frank' }, status: 'active' };
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: instance, error: null }) }) });
    expect(await getInstanceById('i1')).toEqual(instance);
  });

  test('returns null when instance not found', async () => {
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null, error: new Error('No rows') }) }) });
    expect(await getInstanceById('missing')).toBeNull();
  });
});

describe('getActiveInstance()', () => {
  test('returns active instance for sender', async () => {
    const instance = { id: 'i1', workflow_id: 'w1', sender: '5511999', current_step_order: 2, variables: { name: 'Frank' }, status: 'active' };
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: instance, error: null }) }) }) }) }) });
    expect(await getActiveInstance('5511999')).toEqual(instance);
  });

  test('returns null when no active instance', async () => {
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null, error: new Error('No rows') }) }) }) }) }) });
    expect(await getActiveInstance('5511999')).toBeNull();
  });
});

describe('createInstance()', () => {
  test('inserts and returns new instance', async () => {
    const instance = { id: 'i1', workflow_id: 'w1', sender: '5511999', current_step_order: 1, variables: { name: 'Frank' }, status: 'active' };
    mockInsert.mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: instance, error: null }) }) });
    expect(await createInstance('w1', '5511999', { name: 'Frank' })).toEqual(instance);
  });
});

describe('advanceInstance()', () => {
  test('updates step order and variables', async () => {
    mockUpdate.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    await expect(advanceInstance('i1', 2, { name: 'Frank', role: 'Técnico' })).resolves.toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ current_step_order: 2 }));
  });
});

describe('completeInstance()', () => {
  test('sets status to completed', async () => {
    mockUpdate.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    await expect(completeInstance('i1')).resolves.toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });
});

describe('cancelInstance()', () => {
  test('sets status to cancelled', async () => {
    mockUpdate.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    await expect(cancelInstance('i1')).resolves.toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
  });
});

// ── Message Templates ─────────────────────────────────────────────────────────

describe('upsertTemplate()', () => {
  const TPL = { id: 't1', name: 'Onboarding — passo 3', content: 'Bem-vindo, {{name}}!', created_at: '' };

  test('upserts by name and returns the template', async () => {
    mockUpsert.mockReturnValue({
      select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: TPL, error: null }) })
    });

    const result = await upsertTemplate('Onboarding — passo 3', 'Bem-vindo, {{name}}!');

    expect(mockUpsert).toHaveBeenCalledWith(
      { name: 'Onboarding — passo 3', content: 'Bem-vindo, {{name}}!' },
      { onConflict: 'name' }
    );
    expect(result).toEqual(TPL);
  });

  test('throws when Supabase returns an error', async () => {
    mockUpsert.mockReturnValue({
      select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }) })
    });

    await expect(upsertTemplate('fail', 'content')).rejects.toBeDefined();
  });
});

describe('getTemplateByName()', () => {
  const TPL = { id: 't1', name: 'Onboarding — boas-vindas', content: 'Bem-vindo!', created_at: '' };

  test('returns template when found', async () => {
    mockSelect.mockReturnValue({
      eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: TPL, error: null }) })
    });

    const result = await getTemplateByName('Onboarding — boas-vindas');

    expect(result).toEqual(TPL);
  });

  test('returns null when not found', async () => {
    mockSelect.mockReturnValue({
      eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) })
    });

    const result = await getTemplateByName('inexistente');

    expect(result).toBeNull();
  });
});

// ── Notifications ──────────────────────────────────────────────────────────────

describe('createNotification()', () => {
  test('inserts and returns notification', async () => {
    const notif = { id: 'n1', recipient: '5511999', content: 'Lembrete', status: 'pending', created_at: '2026-05-01T00:00:00Z' };
    mockInsert.mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: notif, error: null }) }) });
    expect(await createNotification('5511999', 'Lembrete')).toEqual(notif);
  });
});

describe('markNotificationSent()', () => {
  test('sets status to sent', async () => {
    mockUpdate.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    await expect(markNotificationSent('n1')).resolves.toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'sent' });
  });
});

describe('cancelNotification()', () => {
  test('sets status to cancelled', async () => {
    mockUpdate.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    await expect(cancelNotification('n1')).resolves.toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'cancelled' });
  });
});

describe('getPendingNotifications()', () => {
  test('returns pending notifications due now', async () => {
    const notifs = [{ id: 'n1', recipient: '5511999', content: 'Alerta', status: 'pending' }];
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnValue({ or: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: notifs, error: null }) }) }) });
    expect(await getPendingNotifications()).toEqual(notifs);
  });

  test('returns empty array when none pending', async () => {
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnValue({ or: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: null, error: null }) }) }) });
    expect(await getPendingNotifications()).toEqual([]);
  });
});
