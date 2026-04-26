import { getRole } from '../src/whatsapp/auth';

const RT = '5563999999999';
const TEAM_A = '5563888888888';
const TEAM_B = '5563777777777';
const UNKNOWN = '5563111111111';

// whatsapp-web.js appends @c.us to every sender number
const fmt = (n: string) => `${n}@c.us`;

describe('getRole()', () => {
  beforeEach(() => {
    delete process.env.RT_NUMBER;
    delete process.env.TEAM_NUMBERS;
  });

  test('returns "rt" for the RT number', () => {
    process.env.RT_NUMBER = RT;
    expect(getRole(fmt(RT))).toBe('rt');
  });

  test('returns "team" for a single team number', () => {
    process.env.RT_NUMBER = RT;
    process.env.TEAM_NUMBERS = TEAM_A;
    expect(getRole(fmt(TEAM_A))).toBe('team');
  });

  test('returns "team" for any number in a comma-separated TEAM_NUMBERS list', () => {
    process.env.RT_NUMBER = RT;
    process.env.TEAM_NUMBERS = `${TEAM_A}, ${TEAM_B}`;
    expect(getRole(fmt(TEAM_A))).toBe('team');
    expect(getRole(fmt(TEAM_B))).toBe('team');
  });

  test('returns null for an unknown number', () => {
    process.env.RT_NUMBER = RT;
    process.env.TEAM_NUMBERS = TEAM_A;
    expect(getRole(fmt(UNKNOWN))).toBeNull();
  });

  test('returns null when env vars are unset', () => {
    expect(getRole(fmt(RT))).toBeNull();
    expect(getRole(fmt(TEAM_A))).toBeNull();
  });

  test('RT number is not matched as team even if TEAM_NUMBERS is set', () => {
    process.env.RT_NUMBER = RT;
    process.env.TEAM_NUMBERS = `${RT}, ${TEAM_A}`;
    // RT check runs first, so it returns 'rt', not 'team'
    expect(getRole(fmt(RT))).toBe('rt');
  });
});
