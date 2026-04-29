import { Message } from './glm';

// ── Conversation buffer ──────────────────────────────────────────────────────

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

// ── Pending action store ─────────────────────────────────────────────────────

export type PendingAction =
  | { type: 'save'; demand: { message: string; summary: string; category: string; priority: string }; messageId: string }
  | { type: 'update'; demandId: string; fields: { priority: string; summary: string } }
  | { type: 'resolve'; demandId: string; demandPriority: string; demandSummary: string }
  | { type: 'add_note'; demandId: string; existingNotes: string | undefined; formattedNote: string; demandSummary: string };

const pendingActions = new Map<string, PendingAction>();

export function setPendingAction(sender: string, action: PendingAction): void {
  pendingActions.set(sender, action);
}

export function getPendingAction(sender: string): PendingAction | null {
  return pendingActions.get(sender) ?? null;
}

export function clearPendingAction(sender: string): void {
  pendingActions.delete(sender);
}

// ── Confirmation detection ───────────────────────────────────────────────────

const CONFIRMATIONS = /^(sim|pode|confirma|ok|salva|salvar|isso|correto|certo|é isso|pode salvar|pode registrar|s)\b/i;
const REJECTIONS    = /^(não|nao|cancela|cancelar|para|errado|não é isso|desiste|n)\b/i;

export function isConfirmation(message: string): boolean {
  return CONFIRMATIONS.test(message.trim());
}

export function isRejection(message: string): boolean {
  return REJECTIONS.test(message.trim());
}

// ── Test helper ──────────────────────────────────────────────────────────────

export function clearHistory(sender: string): void {
  buffers.delete(sender);
}

export function _reset(): void {
  buffers.clear();
  pendingActions.clear();
}
