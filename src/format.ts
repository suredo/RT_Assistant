export function noteTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `[${pad(now.getDate())}/${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}]`;
}

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
  demand: { priority: string; summary: string; category?: string; status?: string; notes?: string },
  opts: FormatOptions = {}
): string {
  const resolved = opts.showStatus && demand.status === 'resolved';
  const emoji = resolved ? '✅' : (PRIORITY_EMOJI[demand.priority] ?? '');
  let line = `${emoji} ${demand.summary}`;

  const extras: string[] = [];
  if (opts.showCategory && demand.category) extras.push(demand.category);
  // priority emoji already signals open — only ✅ needs an explicit marker
  if (extras.length) line += ` (${extras.join(', ')})`;

  const result = opts.index !== undefined ? `${opts.index}. ${line}` : line;
  return demand.notes ? `${result}\n   📝 ${demand.notes}` : result;
}
