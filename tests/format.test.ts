import { formatDemand, noteTimestamp } from '../src/format';

const base = { priority: 'high', summary: 'Paciente na cadeira 3' };

describe('formatDemand()', () => {
  test('shows priority emoji and summary by default', () => {
    expect(formatDemand(base)).toBe('🔴 Paciente na cadeira 3');
  });

  test('prepends index when provided', () => {
    expect(formatDemand(base, { index: 2 })).toBe('2. 🔴 Paciente na cadeira 3');
  });

  test('appends category when showCategory is true', () => {
    const demand = { ...base, category: 'urgência clínica' };
    expect(formatDemand(demand, { showCategory: true })).toBe('🔴 Paciente na cadeira 3 (urgência clínica)');
  });

  test('shows no status text for open demands — priority emoji is enough', () => {
    const demand = { ...base, status: 'open' };
    expect(formatDemand(demand, { showStatus: true })).toBe('🔴 Paciente na cadeira 3');
  });

  test('swaps priority emoji for ✅ when demand is resolved', () => {
    const demand = { ...base, status: 'resolved' };
    expect(formatDemand(demand, { showStatus: true })).toBe('✅ Paciente na cadeira 3');
  });

  test('resolved demand shows no status text — ✅ is enough', () => {
    const demand = { ...base, category: 'urgência clínica', status: 'resolved' };
    expect(formatDemand(demand, { showCategory: true, showStatus: true }))
      .toBe('✅ Paciente na cadeira 3 (urgência clínica)');
  });

  test('shows category but no status text for open demands', () => {
    const demand = { ...base, category: 'urgência clínica', status: 'open' };
    expect(formatDemand(demand, { showCategory: true, showStatus: true }))
      .toBe('🔴 Paciente na cadeira 3 (urgência clínica)');
  });

  test('index with resolved demand', () => {
    const demand = { ...base, status: 'resolved' };
    expect(formatDemand(demand, { index: 1, showStatus: true }))
      .toBe('1. ✅ Paciente na cadeira 3');
  });

  test('falls back gracefully for unknown priority', () => {
    expect(formatDemand({ priority: 'unknown', summary: 'Teste' })).toBe(' Teste');
  });

  test('does not show extras section when demand has no category or status', () => {
    expect(formatDemand(base, { showCategory: true, showStatus: true }))
      .toBe('🔴 Paciente na cadeira 3');
  });

  test('appends notes on a second line when present', () => {
    const demand = { ...base, notes: '[29/04 14:32] Liguei para o fornecedor' };
    expect(formatDemand(demand)).toBe(
      '🔴 Paciente na cadeira 3\n   📝 [29/04 14:32] Liguei para o fornecedor'
    );
  });

  test('notes appear after index prefix', () => {
    const demand = { ...base, notes: '[29/04 14:32] Aguardando retorno' };
    expect(formatDemand(demand, { index: 1 })).toBe(
      '1. 🔴 Paciente na cadeira 3\n   📝 [29/04 14:32] Aguardando retorno'
    );
  });

  test('does not show notes line when notes is undefined', () => {
    expect(formatDemand(base)).toBe('🔴 Paciente na cadeira 3');
  });
});

describe('noteTimestamp()', () => {
  test('returns timestamp in [DD/MM HH:MM] format', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-29T14:32:00'));
    expect(noteTimestamp()).toBe('[29/04 14:32]');
    jest.useRealTimers();
  });

  test('pads single-digit day, month, hour and minute with leading zero', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-05T09:07:00'));
    expect(noteTimestamp()).toBe('[05/01 09:07]');
    jest.useRealTimers();
  });
});
