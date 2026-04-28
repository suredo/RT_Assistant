export const PRIORITY_EMOJI: Record<string, string> = {
  high:   '🔴',
  medium: '🟡',
  low:    '⚪'
};

export interface FormatOptions {
  index?:        number;  // when set, prepends "N. " to the line
  showCategory?: boolean;
  showStatus?:   boolean;
}

export function formatDemand(
  demand: { priority: string; summary: string; category?: string; status?: string },
  opts: FormatOptions = {}
): string {
  const resolved = opts.showStatus && demand.status === 'resolved';
  const emoji = resolved ? '✅' : (PRIORITY_EMOJI[demand.priority] ?? '');
  let line = `${emoji} ${demand.summary}`;

  const extras: string[] = [];
  if (opts.showCategory && demand.category) extras.push(demand.category);
  // status text is skipped when resolved — ✅ already communicates it
  if (opts.showStatus && !resolved && demand.status) extras.push(demand.status);
  if (extras.length) line += ` (${extras.join(', ')})`;

  return opts.index !== undefined ? `${opts.index}. ${line}` : line;
}
