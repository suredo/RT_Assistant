import {
  getWorkflowSteps,
  getInstanceById,
  getActiveInstance,
  createInstance,
  advanceInstance,
  completeInstance,
  cancelInstance,
  WorkflowInstance,
} from '../db/workflows';
import { interpolate } from './interpolate';
import { classify } from '../ai/classifier';
import { PendingAction } from '../ai/context';
import { formatDemand } from '../format';

export type StepResult =
  | { action: 'send_message';         content: string; instanceId: string }
  | { action: 'ask_question';         prompt: string; variableName: string; instanceId: string }
  | { action: 'confirm_demand';       pendingAction: PendingAction; confirmPrompt: string }
  | { action: 'confirm_notification'; pendingAction: PendingAction; confirmPrompt: string }
  | { action: 'workflow_complete';    summary: string }
  | { action: 'workflow_cancelled' }
  | { action: 'error';               message: string }

async function executeStep(instance: WorkflowInstance): Promise<StepResult> {
  const steps = await getWorkflowSteps(instance.workflow_id);
  const step = steps.find(s => s.step_order === instance.current_step_order);

  if (!step) {
    await completeInstance(instance.id);
    return { action: 'workflow_complete', summary: '✅ Fluxo concluído.' };
  }

  const vars = instance.variables as Record<string, string>;
  const content = interpolate(step.content, vars);

  if (step.step_type === 'send_message') {
    return { action: 'send_message', content, instanceId: instance.id };
  }

  if (step.step_type === 'ask_question') {
    if (!step.variable_name) {
      return { action: 'error', message: `Passo ${step.step_order} do tipo ask_question não tem variable_name definido.` };
    }
    // Auto-skip: the variable was already captured from the trigger message —
    // no need to ask the user for information they already provided.
    if (vars[step.variable_name] !== undefined) {
      const nextOrder = instance.current_step_order + 1;
      await advanceInstance(instance.id, nextOrder, vars);
      return executeStep({ ...instance, current_step_order: nextOrder, variables: vars });
    }
    return { action: 'ask_question', prompt: content, variableName: step.variable_name, instanceId: instance.id };
  }

  if (step.step_type === 'create_demand') {
    const cl = await classify(content);
    const demand = { message: content, summary: cl.summary, category: cl.category, priority: cl.priority };
    const pendingAction: PendingAction = { type: 'workflow_save_demand', instanceId: instance.id, demand, messageId: '' };
    const confirmPrompt = `📝 Vou registrar esta demanda:\n${formatDemand(demand, { showCategory: true })}\n\nConfirma? (sim/não)`;
    return { action: 'confirm_demand', pendingAction, confirmPrompt };
  }

  if (step.step_type === 'create_notification') {
    const pendingAction: PendingAction = {
      type: 'create_notification',
      instanceId: instance.id,
      recipient: instance.sender,
      content,
      notificationSummary: content.length > 80 ? content.slice(0, 77) + '...' : content,
    };
    const confirmPrompt = `🔔 Vou criar esta notificação:\n${content}\n\nConfirma? (sim/não)`;
    return { action: 'confirm_notification', pendingAction, confirmPrompt };
  }

  return { action: 'error', message: `Tipo de passo "${step.step_type}" ainda não suportado nesta versão.` };
}

export async function triggerWorkflow(
  workflowId: string,
  sender: string,
  initialVariables: Record<string, string>
): Promise<StepResult> {
  const instance = await createInstance(workflowId, sender, initialVariables);
  return executeStep(instance);
}

export async function advanceAfterConfirmation(instanceId: string): Promise<StepResult> {
  const instance = await getInstanceById(instanceId);
  if (!instance) return { action: 'error', message: 'Instância de workflow não encontrada.' };

  const steps = await getWorkflowSteps(instance.workflow_id);
  const nextOrder = instance.current_step_order + 1;

  if (!steps.some(s => s.step_order === nextOrder)) {
    await completeInstance(instanceId);
    return { action: 'workflow_complete', summary: '✅ Fluxo concluído.' };
  }

  await advanceInstance(instanceId, nextOrder, instance.variables as Record<string, string>);
  return executeStep({ ...instance, current_step_order: nextOrder });
}

export async function answerQuestion(instanceId: string, answer: string): Promise<StepResult> {
  const instance = await getInstanceById(instanceId);
  if (!instance) return { action: 'error', message: 'Instância de workflow não encontrada.' };

  const steps = await getWorkflowSteps(instance.workflow_id);
  const step = steps.find(s => s.step_order === instance.current_step_order);

  if (!step?.variable_name) {
    return { action: 'error', message: 'Passo atual não é uma pergunta com variável definida.' };
  }

  const updatedVars = { ...(instance.variables as Record<string, string>), [step.variable_name]: answer };
  const nextOrder = instance.current_step_order + 1;

  if (!steps.some(s => s.step_order === nextOrder)) {
    await advanceInstance(instanceId, nextOrder, updatedVars);
    await completeInstance(instanceId);
    return { action: 'workflow_complete', summary: '✅ Fluxo concluído.' };
  }

  await advanceInstance(instanceId, nextOrder, updatedVars);
  return executeStep({ ...instance, current_step_order: nextOrder, variables: updatedVars });
}

export async function cancelWorkflow(instanceId: string): Promise<StepResult> {
  await cancelInstance(instanceId);
  return { action: 'workflow_cancelled' };
}

/**
 * Safe lazy-rehydration helper: returns an active instance only when it is
 * genuinely paused waiting for a user answer (current step is ask_question
 * with a variable_name).  Instances stuck at send_message, create_demand, or
 * create_notification — e.g. left over from a previous bot session — are
 * silently ignored so they do not hijack unrelated messages.
 */
export async function getResumableInstance(sender: string): Promise<WorkflowInstance | null> {
  const instance = await getActiveInstance(sender);
  if (!instance) return null;

  const steps = await getWorkflowSteps(instance.workflow_id);
  const currentStep = steps.find(s => s.step_order === instance.current_step_order);

  if (currentStep?.step_type === 'ask_question' && currentStep.variable_name) {
    return instance;
  }
  return null;
}
