import { chat } from '../ai/glm';
import {
  getAllWorkflows, createWorkflow, updateWorkflow,
  createWorkflowStep, deleteWorkflowSteps,
  Workflow,
} from '../db/workflows';

// ── Command schema ─────────────────────────────────────────────────────────────

interface StepDef {
  step_order: number;
  step_type: string;
  content: string;
  variable_name?: string;
}

interface ManageCommand {
  operation: 'list' | 'create' | 'edit' | 'toggle' | 'unknown';
  name?: string;
  description?: string;
  active?: boolean;
  steps?: StepDef[];
}

const FALLBACK_CMD: ManageCommand = { operation: 'unknown' };

// ── LLM prompt ─────────────────────────────────────────────────────────────────

const STEP_TYPES =
  '"send_message" (envia mensagem ao usuário), ' +
  '"ask_question" (faz uma pergunta e captura a resposta em uma variável {{nome}}), ' +
  '"create_demand" (cria uma demanda após confirmação do usuário), ' +
  '"create_notification" (cria uma notificação após confirmação do usuário)';

const MANAGER_PROMPT = `Você é um assistente para gerenciar workflows de uma clínica de hemodiálise.
Analise a mensagem e retorne SOMENTE um JSON válido com os campos:
- operation: "list" | "create" | "edit" | "toggle" | "unknown"
- name: nome do workflow (obrigatório para create/edit/toggle)
- description: descrição do gatilho em linguagem natural, ex: "Quando um colaborador é contratado" (obrigatório para create; opcional para edit)
- active: true para ativar, false para desativar (somente para toggle)
- steps: array de passos (obrigatório para create/edit), cada passo com:
  - step_order: inteiro começando em 1
  - step_type: ${STEP_TYPES}
  - content: texto do passo — use {{variavel}} para interpolação de variáveis capturadas
  - variable_name: nome da variável a capturar (somente para ask_question)

Use "list" para listar/ver os workflows cadastrados.
Use "toggle" para ativar ou desativar um workflow existente.
Use "create" para criar um novo workflow com seus passos.
Use "edit" para substituir todos os passos de um workflow existente.
Use "unknown" se o pedido não se encaixar em nenhuma operação acima.
Retorne APENAS o JSON, sem texto adicional.`;

// ── Parser ─────────────────────────────────────────────────────────────────────

async function parseCommand(message: string): Promise<ManageCommand> {
  try {
    const raw = await chat([
      { role: 'system', content: MANAGER_PROMPT },
      { role: 'user', content: message },
    ]);
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return FALLBACK_CMD;
    return JSON.parse(json) as ManageCommand;
  } catch {
    return FALLBACK_CMD;
  }
}

// ── Formatters ─────────────────────────────────────────────────────────────────

export function formatWorkflowList(workflows: Workflow[]): string {
  if (!workflows.length) return '📋 Nenhum workflow cadastrado.';
  const items = workflows
    .map((w, i) => `${i + 1}. ${w.is_active ? '✅' : '⏸️'} *${w.name}*\n   _${w.description}_`)
    .join('\n\n');
  return `📋 *Workflows cadastrados:*\n\n${items}`;
}

// ── Operations ─────────────────────────────────────────────────────────────────

async function findWorkflowByName(name: string): Promise<Workflow | null> {
  const workflows = await getAllWorkflows();
  return workflows.find(w => w.name.toLowerCase() === name.toLowerCase()) ?? null;
}

async function saveSteps(workflowId: string, steps: StepDef[]): Promise<void> {
  for (const s of steps) {
    await createWorkflowStep({
      workflow_id: workflowId,
      step_order: s.step_order,
      step_type: s.step_type,
      content: s.content,
      variable_name: s.variable_name,
    });
  }
}

// ── Public handler ─────────────────────────────────────────────────────────────

export async function handleManageWorkflows(message: string): Promise<string> {
  const cmd = await parseCommand(message);

  if (cmd.operation === 'list') {
    const workflows = await getAllWorkflows();
    return formatWorkflowList(workflows);
  }

  if (cmd.operation === 'create') {
    if (!cmd.name || !cmd.description || !cmd.steps?.length) {
      return '⚠️ Para criar um workflow preciso do nome, da descrição (gatilho) e de pelo menos um passo.';
    }
    const workflow = await createWorkflow(cmd.name, cmd.description);
    await saveSteps(workflow.id, cmd.steps);
    const n = cmd.steps.length;
    return `✅ Workflow *${workflow.name}* criado com ${n} passo${n > 1 ? 's' : ''}.`;
  }

  if (cmd.operation === 'edit') {
    if (!cmd.name || !cmd.steps?.length) {
      return '⚠️ Para editar um workflow preciso do nome e dos novos passos.';
    }
    const target = await findWorkflowByName(cmd.name);
    if (!target) return `⚠️ Workflow "${cmd.name}" não encontrado.`;

    await deleteWorkflowSteps(target.id);
    await saveSteps(target.id, cmd.steps);
    if (cmd.description) await updateWorkflow(target.id, { description: cmd.description });

    const n = cmd.steps.length;
    return `✅ Workflow *${target.name}* atualizado com ${n} passo${n > 1 ? 's' : ''}.`;
  }

  if (cmd.operation === 'toggle') {
    if (!cmd.name || cmd.active === undefined) {
      return '⚠️ Para ativar/desativar um workflow preciso do nome e da ação (ativar ou desativar).';
    }
    const target = await findWorkflowByName(cmd.name);
    if (!target) return `⚠️ Workflow "${cmd.name}" não encontrado.`;

    await updateWorkflow(target.id, { is_active: cmd.active });
    const status = cmd.active ? 'ativado ✅' : 'desativado ⏸️';
    return `Workflow *${target.name}* ${status}.`;
  }

  return '⚠️ Não entendi o pedido. Você pode listar, criar, editar ou ativar/desativar workflows.';
}
