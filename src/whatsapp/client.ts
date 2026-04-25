import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { reply } from '../ai/glm';

export function start(): Client {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', (qr: string) => {
    console.log('\n📱 Escaneie o QR Code abaixo com o número do assistente:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('✅ RT Assistant conectado e pronto');
  });

  client.on('auth_failure', () => {
    console.error('❌ Falha na autenticação — delete a pasta .wwebjs_auth e tente novamente');
  });

  client.on('disconnected', (reason: string) => {
    console.warn('⚠️ Desconectado:', reason);
    setTimeout(() => client.initialize(), 5000);
  });

  client.on('message', async (msg) => {
    if (msg.from.includes('@g.us')) return;
    if (msg.fromMe) return;

    console.log(`\n📩 [${new Date().toLocaleTimeString()}] ${msg.from}: ${msg.body}`);

    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const response = await reply(msg.body);

    console.log(`🤖 Resposta: ${response}\n`);
    await msg.reply(response);
  });

  client.initialize();
  return client;
}
