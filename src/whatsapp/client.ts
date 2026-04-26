import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { reply, SYSTEM_PROMPT, TEAM_PROMPT } from '../ai/glm';
import { getRole } from './auth';
import { classify } from '../ai/classifier';
import { getHistory, addTurn } from '../ai/context';
import { saveDemand, getOpenDemands } from '../db/supabase';

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

    const classification = await classify(msg.body);

    if (classification.type === 'new_demand') {
      try {
        await saveDemand({
          message: msg.body,
          summary: classification.summary,
          category: classification.category,
          priority: classification.priority
        });
      } catch (err) {
        console.error('⚠️ Erro ao salvar demanda:', err);
      }
    }

    let systemPrompt = role === 'rt' ? SYSTEM_PROMPT : TEAM_PROMPT;
    if (role === 'rt') {
      try {
        const openDemands = await getOpenDemands({ days: 7 });
        if (openDemands.length) {
          const demandList = openDemands
            .map(d => `- [${d.priority}] ${d.summary} (${d.category})`)
            .join('\n');
          systemPrompt += `\n\n## Demandas em aberto (últimos 7 dias):\n${demandList}`;
        }
      } catch (err) {
        console.error('⚠️ Erro ao buscar demandas:', err);
      }
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
