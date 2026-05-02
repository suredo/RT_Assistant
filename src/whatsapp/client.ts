import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { getRole } from './auth';
import { handleMessage } from './handler';
import { startNotificationDispatcher } from '../workflows/notifications';
import { startBriefingSchedule, startHeartbeat } from '../briefing';
import { syncMissedDemands } from '../sync';
import puppeteer from 'puppeteer';

export { handleMessage } from './handler';

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
    startNotificationDispatcher(client);
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

    // Refresh the typing indicator every 5 s — WhatsApp hides it after ~10 s
    msgChat.sendStateTyping();
    const typingInterval = setInterval(() => msgChat.sendStateTyping(), 5000);

    const sendFn = async (content: string) => {
      console.log(`🤖 Resposta: ${content}\n`);
      try {
        await msg.reply(content);
      } catch {
        await client.sendMessage(msg.from, content);
      }
    };

    try {
      await handleMessage(msg.body, senderNumber, role, sendFn);
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
