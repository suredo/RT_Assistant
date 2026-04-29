import { Client } from 'whatsapp-web.js';
import { classify } from './ai/classifier';
import { saveDemand, findDemandByMessage } from './db/supabase';
import { getLastActive, setLastActive } from './db/botState';

export async function syncMissedDemands(client: Client): Promise<number> {
  const lastActive = await getLastActive();
  const lastActiveUnix = Math.floor(lastActive.getTime() / 1000);

  // Prefer LID-based chat ID when RT_LID is set — @c.us lookup throws
  // "No LID for user" on accounts where WhatsApp uses LIDs internally.
  const rtLid = process.env.RT_LID?.trim();
  const rtChatId = rtLid ? `${rtLid}@lid` : `${process.env.RT_NUMBER}@c.us`;
  let chat;
  try {
    chat = await client.getChatById(rtChatId);
  } catch (err) {
    console.error('⚠️ Sync: não foi possível obter o chat da RT:', err);
    return 0;
  }

  const messages = await chat.fetchMessages({ limit: 100 });
  const missed = messages.filter(
    msg => msg.timestamp > lastActiveUnix && !msg.fromMe && msg.type === 'chat'
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

  await setLastActive();

  if (count > 0) {
    const plural = count === 1 ? 'demanda' : 'demandas';
    await client.sendMessage(rtChatId, `🔄 Sincronizei ${count} ${plural} registrada(s) enquanto estava offline.`);
    console.log(`🔄 Sync: ${count} demanda(s) recuperada(s) do histórico`);
  } else {
    console.log('🔄 Sync: nenhuma demanda nova encontrada no histórico');
  }

  return count;
}
