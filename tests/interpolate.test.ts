import { interpolate, extractVariableNames, missingVariables } from '../src/workflows/interpolate';

describe('interpolate()', () => {
  test('replaces a single placeholder', () => {
    expect(interpolate('Olá {{name}}', { name: 'Frank' })).toBe('Olá Frank');
  });

  test('replaces multiple placeholders', () => {
    expect(interpolate('{{name}}, cargo: {{role}}', { name: 'Frank', role: 'Técnico' }))
      .toBe('Frank, cargo: Técnico');
  });

  test('replaces the same placeholder multiple times', () => {
    expect(interpolate('{{name}} é {{name}}', { name: 'Frank' })).toBe('Frank é Frank');
  });

  test('leaves unknown placeholders as-is', () => {
    expect(interpolate('Olá {{name}}', {})).toBe('Olá {{name}}');
  });

  test('leaves unknown placeholder intact while replacing known ones', () => {
    expect(interpolate('{{name}} — {{unknown}}', { name: 'Frank' }))
      .toBe('Frank — {{unknown}}');
  });

  test('returns template unchanged when there are no placeholders', () => {
    expect(interpolate('Sem variáveis', { name: 'Frank' })).toBe('Sem variáveis');
  });

  test('handles empty template', () => {
    expect(interpolate('', { name: 'Frank' })).toBe('');
  });

  test('handles empty variables', () => {
    expect(interpolate('{{a}} {{b}}', {})).toBe('{{a}} {{b}}');
  });
});

describe('extractVariableNames()', () => {
  test('extracts a single variable name', () => {
    expect(extractVariableNames('Olá {{name}}')).toEqual(['name']);
  });

  test('extracts multiple variable names', () => {
    expect(extractVariableNames('{{name}}, cargo: {{role}}')).toEqual(['name', 'role']);
  });

  test('extracts duplicate names separately', () => {
    expect(extractVariableNames('{{name}} e {{name}}')).toEqual(['name', 'name']);
  });

  test('returns empty array when no placeholders', () => {
    expect(extractVariableNames('Sem variáveis')).toEqual([]);
  });
});

describe('missingVariables()', () => {
  test('returns empty array when all variables are present', () => {
    expect(missingVariables('{{name}} {{role}}', { name: 'Frank', role: 'Técnico' })).toEqual([]);
  });

  test('returns missing variable names', () => {
    expect(missingVariables('{{name}} {{role}}', { name: 'Frank' })).toEqual(['role']);
  });

  test('returns all names when variables is empty', () => {
    expect(missingVariables('{{name}} {{role}}', {})).toEqual(['name', 'role']);
  });

  test('returns empty array when template has no placeholders', () => {
    expect(missingVariables('sem variáveis', { name: 'Frank' })).toEqual([]);
  });
});
