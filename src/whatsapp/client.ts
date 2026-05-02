import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { reply, SYSTEM_PROMPT, TEAM_PROMPT } from '../ai/glm';
import { getRole } from './auth';
import { classify, mergeSummary } from '../ai/classifier';
import {
  getHistory, addTurn, clearHistory,
  getPendingAction, setPendingAction, clearPendingAction,
  isConfirmation, isRejection,
  setActiveWorkflow, getActiveWorkflow, clearActiveWorkflow,
  PendingAction
} from '../ai/context';
import { saveDemand, updateDemand, resolveDemand, appendNote, getOpenDemands, getDemands, Demand } from '../db/supabase';
import { getActiveWorkflows, getActiveInstance, createNotification } from '../db/workflows';
import { triggerWorkflow, advanceAfterConfirmation, answerQuestion, cancelWorkflow, StepResult } from '../workflows/engine';
import { handleManageWorkflows } from '../workflows/manager';
import { startBriefingSchedule, startHeartbeat } from '../briefing';
import { syncMissedDemands } from '../sync';
import { formatDemand, noteTimestamp } from '../format';
import puppeteer from 'puppeteer';

function confirmationPrompt(action: PendingAction): string {
  if (action.type === 'save') {
    return `📝 Vou registrar esta demanda:\n${formatDemand(action.demand, { showCategory: true })}\n\nConfirma? (sim/não)`;
  }
  if (action.type === 'update') {
    return `✏️ Vou atualizar a demanda:\n${formatDemand(action.fields)}\n\nConfirma? (sim/não)`;
  }
  if (action.type === 'add_note') {
    return `📝 Vou adicionar esta nota à demanda "${action.demandSummary}":\n${action.formattedNote}\n\nConfirma? (sim/não)`;
  }
  return `✅ Vou marcar como resolvida:\n${formatDemand({ priority: action.demandPriority, summary: action.demandSummary })}\n\nConfirma? (sim/não)`;
}

async function executePendingAction(action: PendingAction, sender: string, sendFn: (content: string) => Promise<void>): Promise<void> {
  if (action.type === 'save') {
    await saveDemand({ ...action.demand, whatsapp_message_id: action.messageId });
  } else if (action.type === 'update') {
    await updateDemand(action.demandId, action.fields);
  } else if (action.type === 'add_note') {
    await appendNote(action.demandId, action.existingNotes, action.formattedNote);
  } else if (action.type === 'resolve') {
    await resolveDemand(action.demandId);
  } else if (action.type === 'workflow_save_demand') {
    await saveDemand({ ...action.demand, whatsapp_message_id: action.messageId || undefined });
    const result = await advanceAfterConfirmation(action.instanceId);
    await handleStepResult(result, sender, sendFn);
    return;
  } else if (action.type === 'advance_workflow') {
    const result = await advanceAfterConfirmation(action.instanceId);
    await handleStepResult(result, sender, sendFn);
    return;
  } else if (action.type === 'create_notification') {
    await createNotification(action.recipient, action.content, action.scheduledAt, action.cronExpr);
    if (action.instanceId) {
      const result = await advanceAfterConfirmation(action.instanceId);
      await handleStepResult(result, sender, sendFn);
      return;
    }
  }
}

async function handleStepResult(
  result: StepResult,
  sender: string,
  sendFn: (content: string) => Promise<void>
): Promise<void> {
  // Auto-advance through consecutive send_message steps (no user input needed)
  while (result.action === 'send_message') {
    await sendFn(result.content);
    result = await advanceAfterConfirmation(result.instanceId);
  }

  if (result.action === 'ask_question') {
    setActiveWorkflow(sender, result.instanceId);
    await sendFn(result.prompt);
  } else if (result.action === 'confirm_demand' || result.action === 'confirm_notification') {
    setPendingAction(sender, result.pendingAction);
    await sendFn(result.confirmPrompt);
  } else if (result.action === 'workflow_complete') {
    clearActiveWorkflow(sender);
    await sendFn(result.summary);
  } else if (result.action === 'workflow_cancelled') {
    clearActiveWorkflow(sender);
    await sendFn('❌ Fluxo cancelado.');
  } else if (result.action === 'error') {
    await sendFn(`⚠️ ${result.message}`);
  }
}

async function createClient(): Promise<void> {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? puppeteer.executablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
  });

  client.on('qr', async (qr: string) => {
    const pairingNumber = process.env.PAIRING_NUMBER;
    if (pairingNumber) {
      try {
        const code = await client.requestPairingCode(pairingNumber);
        console.log(`\n🔑 Código de pareamento: ${code}`);
        console.log('No WhatsApp: Configurações > Aparelhos conectados > Conectar aparelho > Conectar com número de telefone\n');
      } catch {
        console.log('\n📱 Falha ao gerar código — escaneie o QR Code abaixo:\n');
        qrcode.generate(qr, { small: true });
      }
    } else {
      console.log('\n📱 Escaneie o QR Code abaixo com o número do assistente:\n');
      qrcode.generate(qr, { small: true });
    }
  });

  client.on('ready', async () => {
    console.log('✅ RT Assistant conectado e pronto');
    await syncMissedDemands(client);
    startBriefingSchedule(client);
    startHeartbeat();
  });

  client.on('auth_failure', () => {
    console.error('❌ Falha na autenticação — delete a pasta .wwebjs_auth e tente novamente');
  });

  client.on('disconnected', async (reason: string) => {
    console.warn('⚠️ Desconectado:', reason);
    try { await client.destroy(); } catch { /* browser may already be gone */ }
    setTimeout(createClient, 5000);
  });

  client.on('message', async (msg) => {
    if (msg.from.includes('@g.us')) return;
    if (msg.fromMe) return;

    // msg.from may be an @lid (internal WhatsApp Linked Device ID) instead of
    // the phone number — resolve the contact to get the actual number.
    const contact = await msg.getContact();
    const senderNumber = contact.number || msg.from;

    const role = getRole(senderNumber);
    if (!role) {
      console.warn(`⚠️ Mensagem ignorada de número não autorizado: ${senderNumber}`);
      return;
    }

    console.log(`\n📩 [${new Date().toLocaleTimeString()}] [${role}] ${senderNumber}: ${msg.body}`);

    const msgChat = await msg.getChat();

    // Refresh the typing indicator every 5 s — WhatsApp hides it after ~10 s,
    // so without this it disappears while the bot is fetching data or waiting
    // for the LLM. try/finally guarantees cleanup on every exit path.
    msgChat.sendStateTyping();
    const typingInterval = setInterval(() => msgChat.sendStateTyping(), 5000);

    // Shared send helper — prefer msg.reply (keeps thread), fall back to sendMessage
    const sendFn = async (content: string) => {
      try {
        await msg.reply(content);
      } catch {
        await client.sendMessage(msg.from, content);
      }
    };

    try {
      // ── Check for active workflow (ask_question in progress) ───────────────
      let activeInstanceId = getActiveWorkflow(senderNumber);
      if (!activeInstanceId) {
        // Lazy rehydration: covers the bot-restart case
        try {
          const activeInst = await getActiveInstance(senderNumber);
          if (activeInst) {
            activeInstanceId = activeInst.id;
            setActiveWorkflow(senderNumber, activeInstanceId);
          }
        } catch { /* non-critical */ }
      }
      if (activeInstanceId) {
        if (isRejection(msg.body)) {
          await cancelWorkflow(activeInstanceId);
          clearActiveWorkflow(senderNumber);
          await sendFn('❌ Fluxo cancelado. Como posso ajudar?');
          return;
        }
        const result = await answerQuestion(activeInstanceId, msg.body);
        await handleStepResult(result, senderNumber, sendFn);
        return;
      }

      // ── Check for a pending confirmation ───────────────────────────────────
      const pending = getPendingAction(senderNumber);
      if (pending) {
        if (isConfirmation(msg.body)) {
          try {
            await executePendingAction(pending, senderNumber, sendFn);
            clearPendingAction(senderNumber);
            clearHistory(senderNumber);
            // For workflow steps, handleStepResult already sent the next message
            const workflowTypes = ['advance_workflow', 'workflow_save_demand', 'create_notification'];
            if (!workflowTypes.includes(pending.type)) {
              await sendFn('✅ Feito!');
            }
          } catch (err) {
            console.error('⚠️ Erro ao executar ação pendente:', err);
            clearPendingAction(senderNumber);
            await sendFn('⚠️ Erro ao executar a ação. Tente novamente.');
          }
          return;
        }
        if (isRejection(msg.body)) {
          clearPendingAction(senderNumber);
          await sendFn('Cancelado. Como posso ajudar?');
          return;
        }
        // Unrelated message — clear pending and process normally
        clearPendingAction(senderNumber);
      }

      // ── Fetch open demands (RT only) ───────────────────────────────────────
      let openDemands: Demand[] = [];
      if (role === 'rt') {
        try {
          openDemands = await getOpenDemands({ days: 7 });
        } catch (err) {
          console.error('⚠️ Erro ao buscar demandas:', err);
        }
      }

      // ── Fetch active workflows for classifier ──────────────────────────────
      let activeWorkflows: Array<{ id: string; name: string; description: string }> = [];
      try {
        activeWorkflows = await getActiveWorkflows();
      } catch { /* non-critical — classifier falls back to base prompt */ }

      // ── Classify ───────────────────────────────────────────────────────────
      const classification = await classify(msg.body, activeWorkflows);

      // ── Trigger workflow ───────────────────────────────────────────────────
      if (classification.type === 'trigger_workflow' && classification.workflowId) {
        try {
          const result = await triggerWorkflow(
            classification.workflowId,
            senderNumber,
            classification.workflowVariables ?? {}
          );
          await handleStepResult(result, senderNumber, sendFn);
        } catch (err) {
          console.error('⚠️ Erro ao iniciar workflow:', err);
          await sendFn('⚠️ Erro ao iniciar o fluxo. Tente novamente.');
        }
        return;
      }

      // ── Manage workflows ───────────────────────────────────────────────────
      if (classification.type === 'manage_workflows') {
        try {
          const response = await handleManageWorkflows(msg.body);
          await sendFn(response);
        } catch (err) {
          console.error('⚠️ Erro ao gerenciar workflow:', err);
          await sendFn('⚠️ Erro ao processar o pedido. Tente novamente.');
        }
        return;
      }

      // ── Stage write actions — ask for confirmation instead of writing directly
      if (classification.type === 'new_demand') {
        const action: PendingAction = {
          type: 'save',
          demand: {
            message: msg.body,
            summary: classification.summary,
            category: classification.category,
            priority: classification.priority
          },
          messageId: msg.id._serialized
        };
        setPendingAction(senderNumber, action);
        await sendFn(confirmationPrompt(action));
        return;
      }

      if (classification.type === 'update' && classification.demandIndex !== null) {
        const target = openDemands[classification.demandIndex - 1];
        if (target?.id) {
          let action: PendingAction;
          if (classification.resolved) {
            action = { type: 'resolve', demandId: target.id, demandPriority: target.priority, demandSummary: target.summary };
          } else {
            const mergedSummary = await mergeSummary(target.summary, msg.body);
            action = { type: 'update', demandId: target.id, fields: { priority: classification.priority, summary: mergedSummary } };
          }
          setPendingAction(senderNumber, action);
          await sendFn(confirmationPrompt(action));
          return;
        }
      }

      if (classification.type === 'add_note' && classification.demandIndex !== null && classification.note) {
        const target = openDemands[classification.demandIndex - 1];
        if (target?.id) {
          const formattedNote = `${noteTimestamp()} ${classification.note}`;
          const action: PendingAction = {
            type: 'add_note',
            demandId: target.id,
            existingNotes: target.notes,
            formattedNote,
            demandSummary: target.summary
          };
          setPendingAction(senderNumber, action);
          await sendFn(confirmationPrompt(action));
          return;
        }
      }

      // ── LLM reply for queries and unmatched messages ───────────────────────
      // Clear history before a query so the answer comes from the DB-injected
      // system prompt, not from stale conversation context.
      if (classification.type === 'query') clearHistory(senderNumber);

      let systemPrompt = role === 'rt' ? SYSTEM_PROMPT : TEAM_PROMPT;

      if (role === 'rt') {
        // For queries with explicit filters, fetch exactly what was asked for.
        // For everything else (updates, new demands, etc.) use the open demands
        // already fetched — they are what the index references point to.
        let demandsForContext = openDemands;
        let sectionLabel = 'Demandas em aberto (últimos 7 dias)';
        let showStatus = false;

        const qf = classification.type === 'query' ? classification.queryFilters : null;
        if (qf) {
          const days = qf.status === 'open' ? 7 : 30;
          try {
            demandsForContext = await getDemands({
              status: qf.status === 'all' ? undefined : qf.status,
              category: qf.category ?? undefined,
              priority: qf.priority ?? undefined,
              days
            });
          } catch (err) {
            console.error('⚠️ Erro ao buscar demandas filtradas:', err);
          }
          showStatus = qf.status !== 'open';
          sectionLabel = qf.status === 'resolved' ? `Demandas resolvidas (últimos ${days} dias)`
                       : qf.status === 'all'      ? `Todas as demandas (últimos ${days} dias)`
                       : 'Demandas em aberto (últimos 7 dias)';
          if (qf.category) sectionLabel += ` — ${qf.category}`;
          if (qf.priority)  sectionLabel += ` — prioridade ${qf.priority}`;
        }

        if (demandsForContext.length) {
          const demandList = demandsForContext
            .map((d, i) => formatDemand(d, { index: i + 1, showStatus }))
            .join('\n');
          systemPrompt += `\n\n## ${sectionLabel}:\n${demandList}\n\nPara atualizar ou resolver uma demanda, Bianca pode referenciar pelo número (ex: "demanda 2 foi resolvida").`;

          // When asking about a specific demand by index, include the original
          // message text so the LLM can cite it in the response.
          if (classification.demandIndex !== null) {
            const target = demandsForContext[classification.demandIndex - 1];
            if (target?.message) {
              systemPrompt += `\n\nMensagem original da demanda ${classification.demandIndex}: "${target.message}"`;
            }
          }
        }
      }

      const history = getHistory(senderNumber);
      const response = await reply(msg.body, history, systemPrompt);
      addTurn(senderNumber, 'user', msg.body);
      addTurn(senderNumber, 'assistant', response);

      console.log(`🤖 Resposta: ${response}\n`);
      await sendFn(response);
    } finally {
      clearInterval(typingInterval);
    }
  });

  // Wrap initialize() so a ProtocolError from a still-locked Chrome user data
  // directory doesn't crash the process — destroy and retry with a fresh instance.
  try {
    await client.initialize();
  } catch (err) {
    console.error('⚠️ Erro na inicialização, tentando novamente em 10s:', err);
    try { await client.destroy(); } catch { /* ignore */ }
    setTimeout(createClient, 10000);
  }
}

export function start(): void {
  createClient().catch(err => console.error('⚠️ Falha fatal ao iniciar cliente:', err));
}
