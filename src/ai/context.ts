import { Message } from './glm';

const buffers = new Map<string, Message[]>();
const MAX_TURNS = 20; // 10 exchanges × 2 messages each

export function getHistory(sender: string): Message[] {
  return buffers.get(sender) ?? [];
}

export function addTurn(sender: string, role: 'user' | 'assistant', content: string): void {
  const history = getHistory(sender);
  history.push({ role, content });
  if (history.length > MAX_TURNS) history.splice(0, 2);
  buffers.set(sender, history);
}

export function _reset(): void {
  buffers.clear();
}
