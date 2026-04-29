export type Role = 'rt' | 'team';

function parseList(env: string | undefined): string[] {
  return (env ?? '').split(',').map(n => n.trim()).filter(Boolean);
}

export function getRtNumbers(): string[] {
  return parseList(process.env.RT_NUMBER);
}

export function getRtLids(): string[] {
  return parseList(process.env.RT_LID);
}

export function getRole(from: string): Role | null {
  if ([...getRtNumbers(), ...getRtLids()].some(n => from.includes(n))) return 'rt';

  const team = parseList(process.env.TEAM_NUMBERS);
  const teamLids = parseList(process.env.TEAM_LIDS);
  if ([...team, ...teamLids].some(n => from.includes(n))) return 'team';

  return null;
}
