import {
  getWorkflowSteps,
  getInstanceById,
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
