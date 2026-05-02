/**
 * SQLite in-memory adapter — implements the same function signatures as
 * src/db/supabase.ts and src/db/workflows.ts so e2e tests can swap the
 * real Supabase client for a fast, isolated, local database.
 *
 * Usage in e2e tests:
 *   jest.mock('../../../src/db/workflows', () => require('./helpers/testDb'));
 *   jest.mock('../../../src/db/supabase',  () => require('./helpers/testDb'));
 *
 * Call setupTestDb() in beforeAll and clearTestDb() in beforeEach.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { Demand, DemandUpdate, DemandFilters } from '../../../src/db/supabase';
import type { Workflow, WorkflowStep, MessageTemplate, WorkflowInstance, Notification } from '../../../src/db/workflows';

let db: Database.Database;

export function setupTestDb(): void {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS demands (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      whatsapp_message_id TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_steps (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      step_type TEXT NOT NULL,
      content TEXT NOT NULL,
      variable_name TEXT,
      template_id TEXT,
      UNIQUE (workflow_id, step_order)
    );

    CREATE TABLE IF NOT EXISTS workflow_instances (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      current_step_order INTEGER NOT NULL DEFAULT 1,
      variables TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      content TEXT NOT NULL,
      scheduled_at TEXT,
      cron_expr TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
  `);
}

export function clearTestDb(): void {
  db.exec(`
    DELETE FROM notifications;
    DELETE FROM workflow_instances;
    DELETE FROM workflow_steps;
    DELETE FROM workflows;
    DELETE FROM message_templates;
    DELETE FROM demands;
  `);
}

/** Direct access to the underlying DB for assertions in tests */
export function getTestDb(): Database.Database {
  return db;
}

// ── Demands (mirrors src/db/supabase.ts) ──────────────────────────────────────

export async function saveDemand(demand: Omit<Demand, 'id' | 'status' | 'created_at' | 'resolved_at'>): Promise<Demand> {
  const id = randomUUID();
  const created_at = new Date().toISOString();
  db.prepare(`
    INSERT INTO demands (id, message, summary, category, priority, status, created_at, whatsapp_message_id, notes)
    VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `).run(id, demand.message, demand.summary, demand.category, demand.priority, created_at, demand.whatsapp_message_id ?? null, null);
  return { id, ...demand, status: 'open', created_at };
}

export async function updateDemand(id: string, fields: DemandUpdate): Promise<void> {
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE demands SET ${sets} WHERE id = ?`).run(...Object.values(fields), id);
}

export async function resolveDemand(id: string): Promise<void> {
  db.prepare(`UPDATE demands SET status = 'resolved', resolved_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), id);
}

export async function appendNote(id: string, existingNotes: string | undefined, formattedNote: string): Promise<void> {
  const notes = existingNotes ? `${existingNotes}\n${formattedNote}` : formattedNote;
  db.prepare(`UPDATE demands SET notes = ? WHERE id = ?`).run(notes, id);
}

export async function findDemandByMessage(message: string): Promise<Demand | null> {
  return db.prepare(`SELECT * FROM demands WHERE message = ? ORDER BY created_at DESC LIMIT 1`)
    .get(message) as Demand | null;
}

export async function getDemands({ status, category, priority, days = 7 }: DemandFilters = {}): Promise<Demand[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let sql = `SELECT * FROM demands WHERE created_at >= ?`;
  const params: unknown[] = [since];
  if (status) { sql += ` AND status = ?`; params.push(status); }
  if (category) { sql += ` AND category = ?`; params.push(category); }
  if (priority) { sql += ` AND priority = ?`; params.push(priority); }
  sql += ` ORDER BY created_at ASC`;
  return db.prepare(sql).all(...params) as Demand[];
}

export async function getOpenDemands({ days = 7, priority }: { days?: number; priority?: string } = {}): Promise<Demand[]> {
  return getDemands({ status: 'open', priority, days });
}

// ── Workflows (mirrors src/db/workflows.ts) ───────────────────────────────────

function rowToWorkflow(row: Record<string, unknown>): Workflow {
  return { ...(row as unknown as Workflow), is_active: Boolean(row.is_active) };
}

export async function getActiveWorkflows(): Promise<Workflow[]> {
  return (db.prepare(`SELECT * FROM workflows WHERE is_active = 1 ORDER BY name ASC`).all() as Record<string, unknown>[]).map(rowToWorkflow);
}

export async function getAllWorkflows(): Promise<Workflow[]> {
  return (db.prepare(`SELECT * FROM workflows ORDER BY name ASC`).all() as Record<string, unknown>[]).map(rowToWorkflow);
}

export async function getWorkflowById(id: string): Promise<Workflow | null> {
  const row = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToWorkflow(row) : null;
}

export async function createWorkflow(name: string, description: string): Promise<Workflow> {
  const id = randomUUID();
  const created_at = new Date().toISOString();
  db.prepare(`INSERT INTO workflows (id, name, description, is_active, created_at) VALUES (?, ?, ?, 1, ?)`)
    .run(id, name, description, created_at);
  return { id, name, description, is_active: true, created_at };
}

export async function updateWorkflow(id: string, fields: Partial<Pick<Workflow, 'name' | 'description' | 'is_active'>>): Promise<void> {
  const dbFields: Record<string, unknown> = { ...fields };
  if ('is_active' in dbFields) dbFields.is_active = dbFields.is_active ? 1 : 0;
  const sets = Object.keys(dbFields).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE workflows SET ${sets} WHERE id = ?`).run(...Object.values(dbFields), id);
}

export async function getWorkflowSteps(workflowId: string): Promise<WorkflowStep[]> {
  return db.prepare(`SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY step_order ASC`)
    .all(workflowId) as WorkflowStep[];
}

export async function createWorkflowStep(step: Omit<WorkflowStep, 'id'>): Promise<WorkflowStep> {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO workflow_steps (id, workflow_id, step_order, step_type, content, variable_name, template_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, step.workflow_id, step.step_order, step.step_type, step.content, step.variable_name ?? null, step.template_id ?? null);
  return { id, ...step };
}

export async function deleteWorkflowSteps(workflowId: string): Promise<void> {
  db.prepare(`DELETE FROM workflow_steps WHERE workflow_id = ?`).run(workflowId);
}

export async function getTemplates(): Promise<MessageTemplate[]> {
  return db.prepare(`SELECT * FROM message_templates ORDER BY name ASC`).all() as MessageTemplate[];
}

export async function getTemplateById(id: string): Promise<MessageTemplate | null> {
  return db.prepare(`SELECT * FROM message_templates WHERE id = ?`).get(id) as MessageTemplate | null;
}

export async function createTemplate(name: string, content: string): Promise<MessageTemplate> {
  const id = randomUUID();
  const created_at = new Date().toISOString();
  db.prepare(`INSERT INTO message_templates (id, name, content, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, name, content, created_at);
  return { id, name, content, created_at };
}

export async function updateTemplate(id: string, content: string): Promise<void> {
  db.prepare(`UPDATE message_templates SET content = ? WHERE id = ?`).run(content, id);
}

export async function getInstanceById(id: string): Promise<WorkflowInstance | null> {
  const row = db.prepare(`SELECT * FROM workflow_instances WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...(row as unknown as WorkflowInstance), variables: JSON.parse(row.variables as string) };
}

export async function getActiveInstance(sender: string): Promise<WorkflowInstance | null> {
  const row = db.prepare(`
    SELECT * FROM workflow_instances WHERE sender = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `).get(sender) as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...(row as unknown as WorkflowInstance), variables: JSON.parse(row.variables as string) };
}

export async function createInstance(workflowId: string, sender: string, initialVariables: Record<string, string>): Promise<WorkflowInstance> {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO workflow_instances (id, workflow_id, sender, current_step_order, variables, status, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, 'active', ?, ?)
  `).run(id, workflowId, sender, JSON.stringify(initialVariables), now, now);
  return { id, workflow_id: workflowId, sender, current_step_order: 1, variables: initialVariables, status: 'active', created_at: now, updated_at: now };
}

export async function advanceInstance(instanceId: string, nextStepOrder: number, variables: Record<string, string>): Promise<void> {
  db.prepare(`UPDATE workflow_instances SET current_step_order = ?, variables = ?, updated_at = ? WHERE id = ?`)
    .run(nextStepOrder, JSON.stringify(variables), new Date().toISOString(), instanceId);
}

export async function completeInstance(instanceId: string): Promise<void> {
  db.prepare(`UPDATE workflow_instances SET status = 'completed', updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), instanceId);
}

export async function cancelInstance(instanceId: string): Promise<void> {
  db.prepare(`UPDATE workflow_instances SET status = 'cancelled', updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), instanceId);
}

export async function createNotification(recipient: string, content: string, scheduledAt?: string, cronExpr?: string): Promise<Notification> {
  const id = randomUUID();
  const created_at = new Date().toISOString();
  db.prepare(`
    INSERT INTO notifications (id, recipient, content, scheduled_at, cron_expr, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, recipient, content, scheduledAt ?? null, cronExpr ?? null, created_at);
  return { id, recipient, content, scheduled_at: scheduledAt, cron_expr: cronExpr, status: 'pending', created_at };
}

export async function getPendingNotifications(): Promise<Notification[]> {
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM notifications WHERE status = 'pending' AND (scheduled_at IS NULL OR scheduled_at <= ?)
    ORDER BY created_at ASC
  `).all(now) as Notification[];
}

export async function markNotificationSent(id: string): Promise<void> {
  db.prepare(`UPDATE notifications SET status = 'sent' WHERE id = ?`).run(id);
}

export async function cancelNotification(id: string): Promise<void> {
  db.prepare(`UPDATE notifications SET status = 'cancelled' WHERE id = ?`).run(id);
}
