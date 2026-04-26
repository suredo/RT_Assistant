import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { reply, SYSTEM_PROMPT, TEAM_PROMPT } from '../ai/glm';
import { getRole } from './auth';
import { classify, mergeSummary } from '../ai/classifier';
import {
  getHistory, addTurn,
  getPendingAction, setPendingAction, clearPendingAction,
  isConfirmation, isRejection,
  PendingAction
} from '../ai/context';
import { saveDemand, updateDemand, resolveDemand, getOpenDemands, Demand } from '../db/supabase';
import { startBriefingSchedule } from '../briefing';

const PRIORITY_EMOJI: Record<string, string> = { high: '🔴', medium: '🟡', low: '⚪' };

function confirmationPrompt(action: PendingAction): string {
  if (action.type === 'save') {
    const { summary, category, priority } = action.demand;
    return `📝 Vou registrar esta demanda:\n\n*Resumo:* ${summary}\n*Categoria:* ${category}\n*Prioridade:* ${PRIORITY_EMOJI[priority] ?? ''} ${priority}\n\nConfirma? (sim/não)`;
  }
  if (action.type === 'update') {
    const { summary, priority } = action.fields;
    return `✏️ Vou atualizar a demanda:\n\n*Novo resumo:* ${summary}\n*Prioridade:* ${PRIORITY_EMOJI[priority] ?? ''} ${priority}\n\nConfirma? (sim/não)`;
  }
  return `✅ Vou marcar como resolvida:\n*${action.demandSummary}*\n\nConfirma? (sim/não)`;
}

async function executePendingAction(action: PendingAction): Promise<void> {
  if (action.type === 'save') {
    await saveDemand(action.demand);
  } else if (action.type === 'update') {
    await updateDemand(action.demandId, action.fields);
  } else {
    await resolveDemand(action.demandId);
  }
}

async function createClient(): Promise<void> {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
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

  client.on('ready', () => {
    console.log('✅ RT Assistant conectado e pronto');
    startBriefingSchedule(client);
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
    await msgChat.sendStateTyping();

    // ── Check for a pending confirmation ─────────────────────────────────────
    const pending = getPendingAction(senderNumber);
    if (pending) {
      if (isConfirmation(msg.body)) {
        try {
          await executePendingAction(pending);
          clearPendingAction(senderNumber);
          await msg.reply('✅ Feito!');
        } catch (err) {
          console.error('⚠️ Erro ao executar ação pendente:', err);
          clearPendingAction(senderNumber);
          await msg.reply('⚠️ Erro ao executar a ação. Tente novamente.');
        }
        return;
      }
      if (isRejection(msg.body)) {
        clearPendingAction(senderNumber);
        await msg.reply('Cancelado. Como posso ajudar?');
        return;
      }
      // Unrelated message — clear pending and process normally
      clearPendingAction(senderNumber);
    }

    // ── Fetch open demands (RT only) ─────────────────────────────────────────
    let openDemands: Demand[] = [];
    if (role === 'rt') {
      try {
        openDemands = await getOpenDemands({ days: 7 });
      } catch (err) {
        console.error('⚠️ Erro ao buscar demandas:', err);
      }
    }

    // ── Classify ─────────────────────────────────────────────────────────────
    const classification = await classify(msg.body);

    // ── Stage write actions — ask for confirmation instead of writing directly ─
    if (classification.type === 'new_demand') {
      const action: PendingAction = {
        type: 'save',
        demand: {
          message: msg.body,
          summary: classification.summary,
          category: classification.category,
          priority: classification.priority
        }
      };
      setPendingAction(senderNumber, action);
      await msg.reply(confirmationPrompt(action));
      return;
    }

    if (classification.type === 'update' && classification.demandIndex !== null) {
      const target = openDemands[classification.demandIndex - 1];
      if (target?.id) {
        let action: PendingAction;
        if (classification.resolved) {
          action = { type: 'resolve', demandId: target.id, demandSummary: target.summary };
        } else {
          const mergedSummary = await mergeSummary(target.summary, msg.body);
          action = { type: 'update', demandId: target.id, fields: { priority: classification.priority, summary: mergedSummary } };
        }
        setPendingAction(senderNumber, action);
        await msg.reply(confirmationPrompt(action));
        return;
      }
    }

    // ── LLM reply for queries and unmatched messages ──────────────────────────
    let systemPrompt = role === 'rt' ? SYSTEM_PROMPT : TEAM_PROMPT;
    if (role === 'rt' && openDemands.length) {
      const demandList = openDemands
        .map((d, i) => `${i + 1}. [${d.priority}] ${d.summary} (${d.category})`)
        .join('\n');
      systemPrompt += `\n\n## Demandas em aberto (últimos 7 dias):\n${demandList}\n\nPara atualizar ou resolver uma demanda, Bianca pode referenciar pelo número (ex: "demanda 2 foi resolvida").`;
    }

    const history = getHistory(senderNumber);
    const response = await reply(msg.body, history, systemPrompt);
    addTurn(senderNumber, 'user', msg.body);
    addTurn(senderNumber, 'assistant', response);

    console.log(`🤖 Resposta: ${response}\n`);
    await msg.reply(response);
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
