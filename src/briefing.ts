import cron from 'node-cron';
import { Client } from 'whatsapp-web.js';
import { getOpenDemands } from './db/supabase';
import { setLastActive } from './db/botState';
import { formatDemand } from './format';
import { getRtNumbers } from './whatsapp/auth';

export function formatBriefing(demands: Array<{ priority: string; summary: string }>): string {
  const high = demands.filter(d => d.priority === 'high');
  const others = demands.filter(d => d.priority !== 'high');

  let text = '☀️ *Bom dia, Bianca!* Aqui está seu resumo do turno:\n\n';

  if (high.length) {
    text += `🔴 *Urgente (${high.length}):*\n`;
    high.forEach(d => { text += `  • ${formatDemand(d)}\n`; });
    text += '\n';
  }

  if (others.length) {
    text += `🟡 *Pendente (${others.length}):*\n`;
    others.forEach(d => { text += `  • ${formatDemand(d)}\n`; });
  }

  if (!demands.length) {
    text += '✅ Nenhuma pendência das últimas 24h.';
  }

  return text;
}

export function startHeartbeat(): void {
  cron.schedule('*/5 * * * *', () => {
    setLastActive().catch(err => console.error('⚠️ Erro ao atualizar heartbeat:', err));
  });
}

export function startBriefingSchedule(client: Client): void {
  // Every weekday at 06:30
  cron.schedule('30 6 * * 1-5', async () => {
    try {
      const demands = await getOpenDemands({ days: 1 });
      const text = formatBriefing(demands);
      const rtNumbers = getRtNumbers();
      await Promise.all(
        rtNumbers.map(n => client.sendMessage(`${n}@c.us`, text))
      );
      console.log(`☀️ Briefing enviado para ${rtNumbers.length} RT(s)`);
    } catch (err) {
      console.error('⚠️ Erro ao enviar briefing:', err);
    }
  });
}
