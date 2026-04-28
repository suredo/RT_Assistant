const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockUpsert = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: mockSelect,
      eq: mockEq,
      single: mockSingle,
      upsert: mockUpsert,
    })
  })
}));

import { getLastActive, setLastActive } from '../src/db/botState';

beforeEach(() => jest.clearAllMocks());

describe('getLastActive()', () => {
  test('returns the stored date when the record exists', async () => {
    const iso = '2026-04-28T06:00:00.000Z';
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ data: { value: iso }, error: null });

    const result = await getLastActive();

    expect(result).toEqual(new Date(iso));
  });

  test('returns epoch (new Date(0)) when record is missing', async () => {
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ data: null, error: new Error('not found') });

    const result = await getLastActive();

    expect(result).toEqual(new Date(0));
  });
});

describe('setLastActive()', () => {
  test('upserts with the given date', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const date = new Date('2026-04-28T10:00:00.000Z');

    await setLastActive(date);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'last_active_at', value: date.toISOString() })
    );
  });

  test('upserts with current time when no date is given', async () => {
    mockUpsert.mockResolvedValue({ error: null });

    await setLastActive();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'last_active_at' })
    );
  });

  test('throws when Supabase returns an error', async () => {
    mockUpsert.mockResolvedValue({ error: new Error('DB error') });

    await expect(setLastActive()).rejects.toThrow('DB error');
  });
});
