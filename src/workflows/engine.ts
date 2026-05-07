import {
  getWorkflowSteps,
  getTemplateById,
  getInstanceById,
  getActiveInstance,
  createInstance,
  advanceInstance,
  completeInstance,
  cancelInstance,
  WorkflowInstance,
} from '../db/workflows';
import { interpolate } from './interpolate';
import { chat } from '../ai/glm';

// ── System variables ───────────────────────────────────────────────────────────
// Built-in placeholders available in every step content without needing an
// ask_question to capture them. Instance variables (captured from user answers)
// take precedence and can override these if needed.

function systemVariables(): Record<string, string> {
  const now = new Date();
  const locale = 'pt-BR';
  const tz    = { timeZone: 'America/Sao_Paulo' };
  const date  = now.toLocaleDateString(locale, tz);
  const time  = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...tz });
  return {
    data_atual:      date,
    hora_atual:      time,
    data_hora_atual: `${date} ${time}`,
    data:            date,   // alias — LLMs often generate {{data}} instead of {{data_atual}}
  };
}
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
  | { action: 'workflow_unclear';     prompt: string; instanceId: string }
  | { action: 'error';               message: string }

// ── Condition evaluation ───────────────────────────────────────────────────────
// Supports: {{variable}} == value  |  {{variable}} != value
// Comparison is case-insensitive. Unknown variables resolve to empty string.
// Returns true (execute step) when condition is absent or cannot be parsed.

function evaluateCondition(condition: string, vars: Record<string, string>): boolean {
  const resolved = condition.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');

  const eq  = resolved.match(/^(.*?)\s*==\s*(.*)$/);
  if (eq)  return eq[1].trim().toLowerCase() === eq[2].trim().toLowerCase();

  const neq = resolved.match(/^(.*?)\s*!=\s*(.*)$/);
  if (neq) return neq[1].trim().toLowerCase() !== neq[2].trim().toLowerCase();

  return true; // unrecognised syntax → don't skip
}

// ── Answer evaluation ──────────────────────────────────────────────────────────
// Determines whether a user message is a valid answer to the current workflow
// question, an explicit cancellation, or something unclear that needs clarification.

const ANSWER_EVAL_PROMPT =
  'Você está auxiliando num workflow de uma clínica de hemodiálise. ' +
  'Dado a pergunta atual do fluxo e a resposta do usuário, classifique:\n' +
  '- "answer": qualquer resposta plausível — nomes, datas, "Sim", "Não", situações, ' +
  'descrições. NA DÚVIDA use "answer". "Não" como resposta a pergunta de sim/não ou situação é SEMPRE "answer".\n' +
  '- "cancel": pedido EXPLÍCITO de cancelar/sair/parar o fluxo ' +
  '(ex: "cancelar fluxo", "sair do processo", "para tudo", "quero sair").\n' +
  '- "unclear": mensagem que claramente não responde à pergunta E não é cancelamento ' +
  '(ex: pergunta sobre outro assunto, mensagem enviada por engano).\n' +
  'Retorne SOMENTE JSON: {"type":"answer"} | {"type":"cancel"} | {"type":"unclear"}';

async function evaluateAnswer(question: string, answer: string): Promise<'answer' | 'cancel' | 'unclear'> {
  try {
    const raw = await chat([
      { role: 'system', content: ANSWER_EVAL_PROMPT },
      { role: 'user',   content: `Pergunta do fluxo: "${question}"\nResposta do usuário: "${answer}"` },
    ]);
    const json = raw.match(/\{[\s\S]*?\}/)?.[0];
    if (!json) return 'answer';
    const { type } = JSON.parse(json) as { type?: string };
    if (type === 'cancel')  return 'cancel';
    if (type === 'unclear') return 'unclear';
    return 'answer';
  } catch {
    return 'answer'; // safe fallback — never block a valid answer on LLM error
  }
}

async function executeStep(instance: WorkflowInstance): Promise<StepResult> {
  const steps = await getWorkflowSteps(instance.workflow_id);
  const step = steps.find(s => s.step_order === instance.current_step_order);

  if (!step) {
    await completeInstance(instance.id);
    return { action: 'workflow_complete', summary: '✅ Fluxo concluído.' };
  }

  // System variables are available to every step; instance variables (user answers)
  // override them when there is a name collision.
  const vars = { ...systemVariables(), ...(instance.variables as Record<string, string>) };

  // Skip step if its condition evaluates to false.
  if (step.condition && !evaluateCondition(step.condition, vars)) {
    const nextOrder = instance.current_step_order + 1;
    if (!steps.some(s => s.step_order === nextOrder)) {
      await completeInstance(instance.id);
      return { action: 'workflow_complete', summary: '✅ Fluxo concluído.' };
    }
    await advanceInstance(instance.id, nextOrder, instance.variables as Record<string, string>);
    return executeStep({ ...instance, current_step_order: nextOrder });
  }

  const content = interpolate(step.content, vars);

  if (step.step_type === 'send_message') {
    // If a template_id is set, fetch the template content and interpolate it.
    // Falls back to step.content (interpolated above) for legacy steps without a template.
    let messageContent = content;
    if (step.template_id) {
      try {
        const template = await getTemplateById(step.template_id);
        if (template) messageContent = interpolate(template.content, vars);
      } catch { /* non-critical — fallback to step.content */ }
    }
    return { action: 'send_message', content: messageContent, instanceId: instance.id };
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

  // Evaluate whether the message is a valid answer, an explicit cancellation,
  // or something unclear. The LLM decides, so "Não" as answer to a yes/no
  // question is accepted — it only cancels if the user explicitly asks to exit.
  const interpretation = await evaluateAnswer(step.content, answer);
  if (interpretation === 'cancel') {
    await cancelInstance(instanceId);
    return { action: 'workflow_cancelled' };
  }
  if (interpretation === 'unclear') {
    return {
      action: 'workflow_unclear',
      prompt: `Não consegui interpretar sua resposta.\n\n*Pergunta:* ${step.content}\n\nPor favor responda à pergunta, ou diga "cancelar fluxo" para sair.`,
      instanceId,
    };
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
