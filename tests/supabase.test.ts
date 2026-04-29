const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockFromSelect = jest.fn();
const mockEq = jest.fn();
const mockGte = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockSingle = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      insert: mockInsert,
      update: mockUpdate,
      select: mockFromSelect,
      eq: mockEq,
      gte: mockGte,
      order: mockOrder,
      limit: mockLimit,
      single: mockSingle,
    })
  })
}));

import { saveDemand, updateDemand, resolveDemand, getOpenDemands, getDemands, findDemandByMessage } from '../src/db/supabase';

beforeEach(() => jest.clearAllMocks());

describe('saveDemand()', () => {
  test('calls insert with all required fields', async () => {
    mockInsert.mockReturnValue({
      select: () => ({ single: () => ({ data: { id: '123' }, error: null }) })
    });

    await saveDemand({
      message: 'paciente caiu',
      summary: 'Queda de paciente',
      category: 'clinical_urgent',
      priority: 'high'
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'paciente caiu',
        category: 'clinical_urgent',
        priority: 'high'
      })
    );
  });

  test('includes whatsapp_message_id when provided', async () => {
    mockInsert.mockReturnValue({
      select: () => ({ single: () => ({ data: { id: '123' }, error: null }) })
    });

    await saveDemand({
      message: 'paciente caiu',
      summary: 'Queda',
      category: 'urgência clínica',
      priority: 'high',
      whatsapp_message_id: 'false_5511999999999_ABCDEF'
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp_message_id: 'false_5511999999999_ABCDEF' })
    );
  });

  test('throws when Supabase returns an error', async () => {
    mockInsert.mockReturnValue({
      select: () => ({ single: () => ({ data: null, error: new Error('DB error') }) })
    });

    await expect(
      saveDemand({ message: 'x', summary: 'x', category: 'routine', priority: 'low' })
    ).rejects.toThrow('DB error');
  });
});

describe('updateDemand()', () => {
  test('updates the given fields for the demand id', async () => {
    const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });

    await updateDemand('abc-123', { priority: 'high', summary: 'Updated summary' });

    expect(mockUpdate).toHaveBeenCalledWith({ priority: 'high', summary: 'Updated summary' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'abc-123');
  });

  test('throws when Supabase returns an error', async () => {
    const mockUpdateEq = jest.fn().mockResolvedValue({ error: new Error('Update failed') });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });

    await expect(updateDemand('abc-123', { priority: 'low' })).rejects.toThrow('Update failed');
  });
});

describe('resolveDemand()', () => {
  test('updates status to resolved for the given id', async () => {
    const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });

    await resolveDemand('abc-123');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resolved' })
    );
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'abc-123');
  });
});

// getDemands chain: select → gte → [eq(status)] → [eq(category)] → [eq(priority)] → order
describe('getDemands()', () => {
  test('fetches all statuses when no status filter given', async () => {
    mockFromSelect.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getDemands({ days: 7 });

    expect(mockGte).toHaveBeenCalledWith('created_at', expect.any(String));
    expect(mockEq).not.toHaveBeenCalled();
  });

  test('filters by status=resolved', async () => {
    const mockStatusEq = jest.fn().mockReturnValue({ order: mockOrder });
    mockFromSelect.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ eq: mockStatusEq });
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getDemands({ status: 'resolved', days: 30 });

    expect(mockStatusEq).toHaveBeenCalledWith('status', 'resolved');
  });

  test('filters by status and category', async () => {
    const mockCategoryEq = jest.fn().mockReturnValue({ order: mockOrder });
    const mockStatusEq = jest.fn().mockReturnValue({ eq: mockCategoryEq });
    mockFromSelect.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ eq: mockStatusEq });
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getDemands({ status: 'open', category: 'urgência clínica' });

    expect(mockStatusEq).toHaveBeenCalledWith('status', 'open');
    expect(mockCategoryEq).toHaveBeenCalledWith('category', 'urgência clínica');
  });

  test('filters by status and priority', async () => {
    const mockPriorityEq = jest.fn().mockReturnValue({ order: mockOrder });
    const mockStatusEq = jest.fn().mockReturnValue({ eq: mockPriorityEq });
    mockFromSelect.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ eq: mockStatusEq });
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getDemands({ status: 'open', priority: 'high' });

    expect(mockPriorityEq).toHaveBeenCalledWith('priority', 'high');
  });

  test('returns empty array when data is null', async () => {
    mockFromSelect.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: null, error: null });

    const result = await getDemands();

    expect(result).toEqual([]);
  });
});

describe('getOpenDemands()', () => {
  test('filters by status=open and date range', async () => {
    const mockStatusEq = jest.fn().mockReturnValue({ order: mockOrder });
    mockFromSelect.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ eq: mockStatusEq });
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getOpenDemands({ days: 7 });

    expect(mockStatusEq).toHaveBeenCalledWith('status', 'open');
    expect(mockGte).toHaveBeenCalledWith('created_at', expect.any(String));
  });

  test('adds priority filter when provided', async () => {
    const mockPriorityEq = jest.fn().mockReturnValue({ order: mockOrder });
    const mockStatusEq = jest.fn().mockReturnValue({ eq: mockPriorityEq });
    mockFromSelect.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ eq: mockStatusEq });
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getOpenDemands({ days: 7, priority: 'high' });

    expect(mockPriorityEq).toHaveBeenCalledWith('priority', 'high');
  });

  test('returns empty array when data is null', async () => {
    const mockStatusEq = jest.fn().mockReturnValue({ order: mockOrder });
    mockFromSelect.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ eq: mockStatusEq });
    mockOrder.mockResolvedValue({ data: null, error: null });

    const result = await getOpenDemands();

    expect(result).toEqual([]);
  });
});

describe('findDemandByMessage()', () => {
  test('returns the demand when found', async () => {
    const demand = { id: 'abc', message: 'paciente caiu', summary: 'Queda', category: 'urgência clínica', priority: 'high' };
    mockFromSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ data: demand, error: null });

    const result = await findDemandByMessage('paciente caiu');

    expect(result).toEqual(demand);
    expect(mockEq).toHaveBeenCalledWith('message', 'paciente caiu');
  });

  test('returns null when not found', async () => {
    mockFromSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ data: null, error: new Error('not found') });

    const result = await findDemandByMessage('mensagem inexistente');

    expect(result).toBeNull();
  });
});
