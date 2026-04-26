import { getRole } from '../src/whatsapp/auth';

const RT = '5563999999999';
const RT_LID = '262538902147114';
const TEAM_A = '5563888888888';
const TEAM_B = '5563777777777';
const TEAM_LID = '987654321012345';
const UNKNOWN = '5563111111111';

const asCus = (n: string) => `${n}@c.us`;
const asLid = (n: string) => `${n}@lid`;

describe('getRole()', () => {
  beforeEach(() => {
    delete process.env.RT_NUMBER;
    delete process.env.RT_LID;
    delete process.env.TEAM_NUMBERS;
    delete process.env.TEAM_LIDS;
  });

  test('returns "rt" for the RT phone number (@c.us)', () => {
    process.env.RT_NUMBER = RT;
    expect(getRole(asCus(RT))).toBe('rt');
  });

  test('returns "rt" for the RT LID (@lid)', () => {
    process.env.RT_NUMBER = RT;
    process.env.RT_LID = RT_LID;
    expect(getRole(asLid(RT_LID))).toBe('rt');
  });

  test('returns "rt" when only RT_LID is set and phone number is not', () => {
    process.env.RT_LID = RT_LID;
    expect(getRole(asLid(RT_LID))).toBe('rt');
  });

  test('returns "team" for a team phone number', () => {
    process.env.RT_NUMBER = RT;
    process.env.TEAM_NUMBERS = TEAM_A;
    expect(getRole(asCus(TEAM_A))).toBe('team');
  });

  test('returns "team" for a team LID', () => {
    process.env.RT_NUMBER = RT;
    process.env.TEAM_LIDS = TEAM_LID;
    expect(getRole(asLid(TEAM_LID))).toBe('team');
  });

  test('returns "team" for any number in a comma-separated TEAM_NUMBERS list', () => {
    process.env.RT_NUMBER = RT;
    process.env.TEAM_NUMBERS = `${TEAM_A}, ${TEAM_B}`;
    expect(getRole(asCus(TEAM_A))).toBe('team');
    expect(getRole(asCus(TEAM_B))).toBe('team');
  });

  test('returns null for an unknown number', () => {
    process.env.RT_NUMBER = RT;
    process.env.TEAM_NUMBERS = TEAM_A;
    expect(getRole(asCus(UNKNOWN))).toBeNull();
  });

  test('returns null when all env vars are unset', () => {
    expect(getRole(asCus(RT))).toBeNull();
    expect(getRole(asLid(RT_LID))).toBeNull();
  });

  test('RT check runs before team check even if RT number appears in TEAM_NUMBERS', () => {
    process.env.RT_NUMBER = RT;
    process.env.TEAM_NUMBERS = `${RT}, ${TEAM_A}`;
    expect(getRole(asCus(RT))).toBe('rt');
  });
});
