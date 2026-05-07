import { formatHelp, formatWelcome } from '../src/help';

describe('formatWelcome', () => {
  test('mentions Bianca',          () => expect(formatWelcome('rt')).toContain('Bianca'));
  test('mentions "ajuda" keyword', () => expect(formatWelcome('rt')).toContain('ajuda'));
  test('same for rt and team',     () => expect(formatWelcome('rt')).toBe(formatWelcome('team')));
});

describe('formatHelp — rt', () => {
  const h = formatHelp('rt');
  test('includes demand registration',    () => expect(h).toContain('Registrar demandas'));
  test('includes workflow trigger',       () => expect(h).toContain('Acionar workflows'));
  test('includes query section',          () => expect(h).toContain('Consultar demandas'));
  test('includes update/resolve section', () => expect(h).toContain('Atualizar ou resolver'));
  test('includes notifications',          () => expect(h).toContain('notificações'));
  test('includes discuss section',        () => expect(h).toContain('Discutir ideias'));
  test('includes workflow management',    () => expect(h).toContain('Gerenciar workflows'));
  test('includes concrete examples',      () => expect(h).toContain('→'));
});

describe('formatHelp — team', () => {
  const h = formatHelp('team');
  test('includes demand registration', () => expect(h).toContain('Registrar demandas'));
  test('includes workflow trigger',    () => expect(h).toContain('Acionar workflows'));
  test('includes notes section',       () => expect(h).toContain('notas'));
  test('includes notifications',       () => expect(h).toContain('notificações'));
  test('excludes workflow management', () => expect(h).not.toContain('Gerenciar workflows'));
  test('excludes query section',       () => expect(h).not.toContain('Consultar demandas'));
});
