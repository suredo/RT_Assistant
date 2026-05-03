import { chat } from '../ai/glm';
import {
  getAllWorkflows, createWorkflow, updateWorkflow,
  createWorkflowStep, deleteWorkflowSteps, upsertTemplate,
  Workflow,
} from '../db/workflows';

// ── Command schema ─────────────────────────────────────────────────────────────

export interface StepDef {
  step_order: number;
  step_type: string;
  content: string;
  variable_name?: string;
}

export interface ManageCommand {
  operation: 'list' | 'create' | 'edit' | 'toggle' | 'unknown';
  name?: string;
  description?: string;
  active?: boolean;
  steps?: StepDef[];
}

/**
 * Returned by handleManageWorkflows().
 * - immediate: send response.response directly to the user
 * - preview:   show preview to the user and stage a PendingAction for confirmation
 */
export type ManageResult =
  | { type: 'immediate'; response: string }
  | { type: 'preview'; preview: string; cmd: ManageCommand }

const FALLBACK_CMD: ManageCommand = { operation: 'unknown' };

// ── LLM prompt ─────────────────────────────────────────────────────────────────

const STEP_TYPES =
  '"send_message" (entrega uma mensagem ou template SOMENTE para a própria RT no WhatsApp — o bot NÃO envia para terceiros como RH, médicos ou fornecedores; quando o conteúdo é um rascunho para ser encaminhado, abra com "📋 Rascunho para encaminhar ao [destino] — revise antes de enviar:"), ' +
  '"ask_question" (faz uma pergunta e captura a resposta em {{variavel}} — use APENAS quando precisar de informação não disponível na mensagem original), ' +
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

REGRAS IMPORTANTES PARA STEPS:
- Quando o usuário menciona "template", "mensagem para enviar", "mensagem padrão" ou qualquer conteúdo de texto a ser enviado, use step_type "send_message" com o conteúdo completo do template no campo "content". Use {{variavel}} para partes dinâmicas.
- NÃO use múltiplos ask_question para preencher um template. Em vez disso, use ask_question somente para informações realmente necessárias não mencionadas na mensagem, e depois um send_message com o template completo usando {{variavel}}.
- Use "ask_question" com moderação — apenas quando a informação é realmente necessária e não foi fornecida na mensagem original.
- Um workflow de "enviar mensagem para o RH sobre nova contratação" deve ter: ask_question apenas para dados não fornecidos + send_message com o template da mensagem para o RH.
- IMPORTANTE: o bot não envia mensagens para terceiros. Quando o destino final é outra pessoa (RH, médico, fornecedor, direção), o send_message entrega um rascunho para a RT revisar e encaminhar manualmente. Sempre deixe isso explícito no início do content: "📋 Rascunho para encaminhar ao [destino] — revise antes de enviar:".

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

function formatStepType(stepType: string): string {
  const labels: Record<string, string> = {
    send_message:        '📤 Enviar mensagem',
    ask_question:        '❓ Perguntar',
    create_demand:       '📝 Criar demanda',
    create_notification: '🔔 Criar notificação',
  };
  return labels[stepType] ?? stepType;
}

function formatWorkflowPreview(cmd: ManageCommand): string {
  const steps = cmd.steps ?? [];
  const stepLines = steps.map((s, i) => {
    const label = formatStepType(s.step_type);
    const base  = `  ${i + 1}. ${label}: ${s.content}`;
    return s.variable_name ? `${base} → {{${s.variable_name}}}` : base;
  }).join('\n');

  const isCreate = cmd.operation === 'create';
  const header = isCreate
    ? `📋 Vou criar o workflow *${cmd.name}*\n_Gatilho: ${cmd.description}_`
    : `✏️ Vou atualizar o workflow *${cmd.name}*${cmd.description ? `\n_Novo gatilho: ${cmd.description}_` : ''}`;

  const n = steps.length;
  return `${header}\n\n*Passos (${n}):*\n${stepLines}\n\nConfirma? (sim/não)`;
}

// ── Operations ─────────────────────────────────────────────────────────────────

async function findWorkflowByName(name: string): Promise<Workflow | null> {
  const workflows = await getAllWorkflows();
  return workflows.find(w => w.name.toLowerCase() === name.toLowerCase()) ?? null;
}

async function saveSteps(workflowId: string, steps: StepDef[], workflowName?: string): Promise<void> {
  for (const s of steps) {
    let template_id: string | undefined;

    // Auto-save send_message content as a reusable template so it can be
    // referenced independently of the workflow later.
    if (s.step_type === 'send_message' && workflowName) {
      const templateName = `${workflowName} — passo ${s.step_order}`;
      try {
        const tpl = await upsertTemplate(templateName, s.content);
        template_id = tpl.id;
      } catch {
        // Non-critical — step is still saved without a template_id
      }
    }

    await createWorkflowStep({
      workflow_id: workflowId,
      step_order: s.step_order,
      step_type: s.step_type,
      content: s.content,
      variable_name: s.variable_name,
      template_id,
    });
  }
}

/**
 * Execute a previously parsed and confirmed create/edit command.
 * Called from handler.ts after the user confirms the preview.
 */
export async function executeManageCommand(cmd: ManageCommand): Promise<string> {
  if (cmd.operation === 'create') {
    if (!cmd.name || !cmd.description || !cmd.steps?.length) {
      return '⚠️ Para criar um workflow preciso do nome, da descrição (gatilho) e de pelo menos um passo.';
    }
    const workflow = await createWorkflow(cmd.name, cmd.description);
    await saveSteps(workflow.id, cmd.steps, cmd.name);
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
    await saveSteps(target.id, cmd.steps, cmd.name);
    if (cmd.description) await updateWorkflow(target.id, { description: cmd.description });

    const n = cmd.steps.length;
    return `✅ Workflow *${target.name}* atualizado com ${n} passo${n > 1 ? 's' : ''}.`;
  }

  return '⚠️ Operação inválida.';
}

// ── Public handler ─────────────────────────────────────────────────────────────

export async function handleManageWorkflows(message: string): Promise<ManageResult> {
  const cmd = await parseCommand(message);

  if (cmd.operation === 'list') {
    const workflows = await getAllWorkflows();
    return { type: 'immediate', response: formatWorkflowList(workflows) };
  }

  if (cmd.operation === 'create') {
    if (!cmd.name || !cmd.description || !cmd.steps?.length) {
      return { type: 'immediate', response: '⚠️ Para criar um workflow preciso do nome, da descrição (gatilho) e de pelo menos um passo.' };
    }
    return { type: 'preview', preview: formatWorkflowPreview(cmd), cmd };
  }

  if (cmd.operation === 'edit') {
    if (!cmd.name || !cmd.steps?.length) {
      return { type: 'immediate', response: '⚠️ Para editar um workflow preciso do nome e dos novos passos.' };
    }
    // Validate workflow exists before showing a preview
    const target = await findWorkflowByName(cmd.name);
    if (!target) return { type: 'immediate', response: `⚠️ Workflow "${cmd.name}" não encontrado.` };
    return { type: 'preview', preview: formatWorkflowPreview(cmd), cmd };
  }

  if (cmd.operation === 'toggle') {
    if (!cmd.name || cmd.active === undefined) {
      return { type: 'immediate', response: '⚠️ Para ativar/desativar um workflow preciso do nome e da ação (ativar ou desativar).' };
    }
    const target = await findWorkflowByName(cmd.name);
    if (!target) return { type: 'immediate', response: `⚠️ Workflow "${cmd.name}" não encontrado.` };

    await updateWorkflow(target.id, { is_active: cmd.active });
    const status = cmd.active ? 'ativado ✅' : 'desativado ⏸️';
    return { type: 'immediate', response: `Workflow *${target.name}* ${status}.` };
  }

  return { type: 'immediate', response: '⚠️ Não entendi o pedido. Você pode listar, criar, editar ou ativar/desativar workflows.' };
}
