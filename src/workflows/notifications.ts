import cron from 'node-cron';
import { Client } from 'whatsapp-web.js';
import { getPendingNotifications, markNotificationSent } from '../db/workflows';
import { getRtNumbers, getRtLids, getTeamNumbers, getTeamLids } from '../whatsapp/auth';

// ── Address resolution ────────────────────────────────────────────────────────
// WhatsApp Web.js ≥ v1.26 requires contacts to be addressed by their internal
// LID rather than the plain phone number when a LID is known. Prefer @lid when
// the recipient matches a configured number; fall back to @c.us otherwise.

export function resolveSendId(recipient: string): string {
  if (getRtNumbers().some(n => recipient.includes(n))) {
    const lids = getRtLids();
    if (lids.length) return `${lids[0]}@lid`;
  }
  const teamNumbers = getTeamNumbers();
  const teamLids    = getTeamLids();
  const idx = teamNumbers.findIndex(n => recipient.includes(n));
  if (idx >= 0 && teamLids[idx]) return `${teamLids[idx]}@lid`;
  return `${recipient}@c.us`;
}

// ── In-memory job registry ─────────────────────────────────────────────────────
// Tracks running cron tasks for recurring notifications so we don't double-schedule.
// Lost on restart — rehydrated by scheduleRecurringNotifications() at startup.

const recurringJobs = new Map<string, ReturnType<typeof cron.schedule>>();

// ── One-time dispatch ──────────────────────────────────────────────────────────

export async function sendPendingNotifications(client: Client): Promise<void> {
  const pending = await getPendingNotifications();

  for (const n of pending) {
    if (n.cron_expr) continue; // recurring — handled separately via cron jobs

    try {
      await client.sendMessage(resolveSendId(n.recipient), n.content);
      await markNotificationSent(n.id);
      console.log(`🔔 Notificação enviada para ${n.recipient}`);
    } catch (err) {
      console.error(`⚠️ Erro ao enviar notificação ${n.id}:`, err);
    }
  }
}

// ── Recurring scheduling ───────────────────────────────────────────────────────

export async function scheduleRecurringNotifications(client: Client): Promise<void> {
  const pending = await getPendingNotifications();

  for (const n of pending) {
    if (!n.cron_expr) continue;
    if (recurringJobs.has(n.id)) continue; // already registered

    if (!cron.validate(n.cron_expr)) {
      console.warn(`⚠️ Expressão cron inválida para notificação ${n.id}: "${n.cron_expr}"`);
      continue;
    }

    const task = cron.schedule(n.cron_expr, async () => {
      try {
        await client.sendMessage(resolveSendId(n.recipient), n.content);
        console.log(`🔔 Notificação recorrente enviada para ${n.recipient}`);
      } catch (err) {
        console.error(`⚠️ Erro ao enviar notificação recorrente ${n.id}:`, err);
      }
    });

    recurringJobs.set(n.id, task);
    console.log(`📅 Notificação recorrente agendada: ${n.id} (${n.cron_expr})`);
  }
}

// ── Test helpers ──────────────────────────────────────────────────────────────

export function getScheduledJobCount(): number {
  return recurringJobs.size;
}

export function _stopAllJobs(): void {
  for (const task of recurringJobs.values()) task.stop();
  recurringJobs.clear();
}

// ── Dispatcher startup ─────────────────────────────────────────────────────────

export function startNotificationDispatcher(client: Client): void {
  // Every minute: send due one-time notifications and pick up new recurring ones
  cron.schedule('* * * * *', async () => {
    try {
      await sendPendingNotifications(client);
      await scheduleRecurringNotifications(client);
    } catch (err) {
      console.error('⚠️ Erro no dispatcher de notificações:', err);
    }
  });

  // Immediate first run — catches anything due before the first tick
  sendPendingNotifications(client).catch(err => console.error('⚠️', err));
  scheduleRecurringNotifications(client).catch(err => console.error('⚠️', err));

  console.log('🔔 Dispatcher de notificações iniciado');
}
