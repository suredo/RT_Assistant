import { Client } from 'whatsapp-web.js';
import { classify } from './ai/classifier';
import { saveDemand, findDemandByMessage } from './db/supabase';
import { getLastActive, setLastActive } from './db/botState';
import { getRtNumbers, getRtLids } from './whatsapp/auth';

// Resolve a single RT's chat, falling back to contact scan when @c.us / @lid
// lookup throws "No LID for user" (common on WhatsApp accounts using LIDs).
async function getRtChat(client: Client, number: string, lid?: string) {
  const chatId = lid ? `${lid}@lid` : `${number}@c.us`;
  try {
    return await client.getChatById(chatId);
  } catch (err) {
    if (String(err).includes('No LID')) {
      try {
        const contacts = await client.getContacts();
        const contact = contacts.find(c => c.number === number);
        if (contact) return await contact.getChat();
      } catch { /* fall through */ }
    }
    throw err;
  }
}

export async function syncMissedDemands(client: Client): Promise<number> {
  const lastActive = await getLastActive();
  const lastActiveUnix = Math.floor(lastActive.getTime() / 1000);

  const rtNumbers = getRtNumbers();
  const rtLids = getRtLids();
  let totalCount = 0;

  for (let i = 0; i < rtNumbers.length; i++) {
    const number = rtNumbers[i];
    const lid = rtLids[i]; // may be undefined if fewer lids than numbers

    let chat;
    try {
      chat = await getRtChat(client, number, lid);
    } catch (err) {
      console.error(`⚠️ Sync: não foi possível obter o chat da RT ${number}:`, err);
      continue;
    }

    const messages = await chat.fetchMessages({ limit: 100 });
    const missed = messages.filter(
      (msg: { timestamp: number; fromMe: boolean; type: string }) =>
        msg.timestamp > lastActiveUnix && !msg.fromMe && msg.type === 'chat'
    );

    let count = 0;
    for (const msg of missed) {
      const classification = await classify(msg.body);
      if (classification.type !== 'new_demand') continue;

      const existing = await findDemandByMessage(msg.body);
      if (existing) continue;

      await saveDemand({
        message: msg.body,
        summary: classification.summary,
        category: classification.category,
        priority: classification.priority,
        whatsapp_message_id: msg.id._serialized
      });
      count++;
    }

    if (count > 0) {
      const plural = count === 1 ? 'demanda' : 'demandas';
      await client.sendMessage(chat.id._serialized, `🔄 Sincronizei ${count} ${plural} registrada(s) enquanto estava offline.`);
      console.log(`🔄 Sync [${number}]: ${count} demanda(s) recuperada(s) do histórico`);
    }

    totalCount += count;
  }

  if (totalCount === 0) {
    console.log('🔄 Sync: nenhuma demanda nova encontrada no histórico');
  }

  await setLastActive();
  return totalCount;
}
