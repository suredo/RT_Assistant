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

  test('appends status when showStatus is true', () => {
    const demand = { ...base, status: 'open' };
    expect(formatDemand(demand, { showStatus: true })).toBe('🔴 Paciente na cadeira 3 (open)');
  });

  test('appends both category and status when both enabled', () => {
    const demand = { ...base, category: 'urgência clínica', status: 'open' };
    expect(formatDemand(demand, { showCategory: true, showStatus: true }))
      .toBe('🔴 Paciente na cadeira 3 (urgência clínica, open)');
  });

  test('index, category and status all together', () => {
    const demand = { ...base, category: 'urgência clínica', status: 'open' };
    expect(formatDemand(demand, { index: 1, showCategory: true, showStatus: true }))
      .toBe('1. 🔴 Paciente na cadeira 3 (urgência clínica, open)');
  });

  test('falls back gracefully for unknown priority', () => {
    expect(formatDemand({ priority: 'unknown', summary: 'Teste' })).toBe(' Teste');
  });

  test('does not show extras section when demand has no category or status', () => {
    expect(formatDemand(base, { showCategory: true, showStatus: true }))
      .toBe('🔴 Paciente na cadeira 3');
  });
});
