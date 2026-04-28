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

import { saveDemand, updateDemand, resolveDemand, getOpenDemands, findDemandByMessage } from '../src/db/supabase';

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

describe('getOpenDemands()', () => {
  test('filters by status=open and date range', async () => {
    mockFromSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getOpenDemands({ days: 7 });

    expect(mockEq).toHaveBeenCalledWith('status', 'open');
    expect(mockGte).toHaveBeenCalledWith('created_at', expect.any(String));
  });

  test('adds priority filter when provided', async () => {
    const mockPriorityEq = jest.fn().mockReturnValue({ order: mockOrder });
    mockFromSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ eq: mockPriorityEq });
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getOpenDemands({ days: 7, priority: 'high' });

    expect(mockPriorityEq).toHaveBeenCalledWith('priority', 'high');
  });

  test('returns empty array when data is null', async () => {
    mockFromSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ order: mockOrder });
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
