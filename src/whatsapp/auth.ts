export type Role = 'rt' | 'team';

export function getRole(from: string): Role | null {
  const rt = process.env.RT_NUMBER?.trim();
  const rtLid = process.env.RT_LID?.trim();
  if ((rt && from.includes(rt)) || (rtLid && from.includes(rtLid))) return 'rt';

  const team = (process.env.TEAM_NUMBERS ?? '').split(',').map(n => n.trim()).filter(Boolean);
  const teamLids = (process.env.TEAM_LIDS ?? '').split(',').map(n => n.trim()).filter(Boolean);
  if ([...team, ...teamLids].some(n => from.includes(n))) return 'team';

  return null;
}
