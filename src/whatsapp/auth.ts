export type Role = 'rt' | 'team';

export function getRole(from: string): Role | null {
  const rt = process.env.RT_NUMBER?.trim();
  if (rt && from.includes(rt)) return 'rt';

  const team = (process.env.TEAM_NUMBERS ?? '').split(',').map(n => n.trim()).filter(Boolean);
  if (team.some(n => from.includes(n))) return 'team';

  return null;
}
