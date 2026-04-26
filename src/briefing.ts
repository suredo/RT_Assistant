import cron from 'node-cron';
import { Client } from 'whatsapp-web.js';
import { getOpenDemands } from './db/supabase';
import { formatDemand } from './format';

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

export function startBriefingSchedule(client: Client): void {
  // Every weekday at 06:30
  cron.schedule('30 6 * * 1-5', async () => {
    try {
      const demands = await getOpenDemands({ days: 1 });
      const text = formatBriefing(demands);
      await client.sendMessage(`${process.env.RT_NUMBER}@c.us`, text);
      console.log('☀️ Briefing enviado para a RT');
    } catch (err) {
      console.error('⚠️ Erro ao enviar briefing:', err);
    }
  });
}
