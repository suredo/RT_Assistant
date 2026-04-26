import { formatBriefing } from '../src/briefing';

describe('formatBriefing()', () => {
  test('returns a no-pending message when demands is empty', () => {
    const msg = formatBriefing([]);
    expect(msg).toContain('Nenhuma pendência');
  });

  test('lists high-priority demands under the urgent section', () => {
    const demands = [
      { priority: 'high', summary: 'Paciente caiu na cadeira 3' },
      { priority: 'medium', summary: 'Solicitação de material pendente' }
    ];
    const msg = formatBriefing(demands);
    expect(msg).toContain('🔴');
    expect(msg).toContain('Paciente caiu na cadeira 3');
    expect(msg).toContain('🟡');
    expect(msg).toContain('Solicitação de material pendente');
  });

  test('shows only urgent section when all demands are high priority', () => {
    const demands = [{ priority: 'high', summary: 'Item urgente' }];
    const msg = formatBriefing(demands);
    expect(msg).toContain('🔴');
    expect(msg).not.toContain('🟡');
  });

  test('shows correct counts', () => {
    const demands = [
      { priority: 'high', summary: 'A' },
      { priority: 'high', summary: 'B' },
      { priority: 'medium', summary: 'C' }
    ];
    const msg = formatBriefing(demands);
    expect(msg).toContain('(2)');
    expect(msg).toContain('(1)');
  });
});
