import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_KEY as string
);

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Workflow {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  step_type: string;
  content: string;
  variable_name?: string;
  template_id?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  created_at: string;
}

export interface WorkflowInstance {
  id: string;
  workflow_id: string;
  sender: string;
  current_step_order: number;
  variables: Record<string, string>;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  recipient: string;
  content: string;
  scheduled_at?: string;
  cron_expr?: string;
  status: 'pending' | 'sent' | 'cancelled';
  created_at: string;
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export async function getActiveWorkflows(): Promise<Workflow[]> {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getAllWorkflows(): Promise<Workflow[]> {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getWorkflowById(id: string): Promise<Workflow | null> {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function createWorkflow(name: string, description: string): Promise<Workflow> {
  const { data, error } = await supabase
    .from('workflows')
    .insert({ name, description })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWorkflow(id: string, fields: Partial<Pick<Workflow, 'name' | 'description' | 'is_active'>>): Promise<void> {
  const { error } = await supabase
    .from('workflows')
    .update(fields)
    .eq('id', id);
  if (error) throw error;
}

// ── Workflow Steps ────────────────────────────────────────────────────────────

export async function getWorkflowSteps(workflowId: string): Promise<WorkflowStep[]> {
  const { data, error } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('step_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createWorkflowStep(step: Omit<WorkflowStep, 'id'>): Promise<WorkflowStep> {
  const { data, error } = await supabase
    .from('workflow_steps')
    .insert(step)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWorkflowSteps(workflowId: string): Promise<void> {
  const { error } = await supabase
    .from('workflow_steps')
    .delete()
    .eq('workflow_id', workflowId);
  if (error) throw error;
}

// ── Message Templates ─────────────────────────────────────────────────────────

export async function getTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getTemplateByName(name: string): Promise<MessageTemplate | null> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('name', name)
    .single();
  if (error) return null;
  return data;
}

export async function getTemplateById(id: string): Promise<MessageTemplate | null> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function createTemplate(name: string, content: string): Promise<MessageTemplate> {
  const { data, error } = await supabase
    .from('message_templates')
    .insert({ name, content })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTemplate(id: string, content: string): Promise<void> {
  const { error } = await supabase
    .from('message_templates')
    .update({ content })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Create or update a template by name (upsert on the unique name column).
 * Used when saving workflow send_message steps so templates stay in sync
 * with the workflow content.
 */
export async function upsertTemplate(name: string, content: string): Promise<MessageTemplate> {
  const { data, error } = await supabase
    .from('message_templates')
    .upsert({ name, content }, { onConflict: 'name' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Workflow Instances ────────────────────────────────────────────────────────

export async function getInstanceById(id: string): Promise<WorkflowInstance | null> {
  const { data, error } = await supabase
    .from('workflow_instances')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function getActiveInstance(sender: string): Promise<WorkflowInstance | null> {
  const { data, error } = await supabase
    .from('workflow_instances')
    .select('*')
    .eq('sender', sender)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data;
}

export async function createInstance(
  workflowId: string,
  sender: string,
  initialVariables: Record<string, string>
): Promise<WorkflowInstance> {
  const { data, error } = await supabase
    .from('workflow_instances')
    .insert({ workflow_id: workflowId, sender, variables: initialVariables })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function advanceInstance(
  instanceId: string,
  nextStepOrder: number,
  variables: Record<string, string>
): Promise<void> {
  const { error } = await supabase
    .from('workflow_instances')
    .update({ current_step_order: nextStepOrder, variables, updated_at: new Date().toISOString() })
    .eq('id', instanceId);
  if (error) throw error;
}

export async function completeInstance(instanceId: string): Promise<void> {
  const { error } = await supabase
    .from('workflow_instances')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', instanceId);
  if (error) throw error;
}

export async function cancelInstance(instanceId: string): Promise<void> {
  const { error } = await supabase
    .from('workflow_instances')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', instanceId);
  if (error) throw error;
}

/** Cancel every active instance for a sender. Used by the REPL /reset command. */
export async function cancelAllActiveInstances(sender: string): Promise<number> {
  const { data, error } = await supabase
    .from('workflow_instances')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('sender', sender)
    .eq('status', 'active')
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function createNotification(
  recipient: string,
  content: string,
  scheduledAt?: string,
  cronExpr?: string
): Promise<Notification> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({ recipient, content, scheduled_at: scheduledAt, cron_expr: cronExpr })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPendingNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('status', 'pending')
    .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationSent(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ status: 'sent' })
    .eq('id', id);
  if (error) throw error;
}

export async function cancelNotification(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
}
