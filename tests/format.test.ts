import { formatDemand } from '../src/format';

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
});
