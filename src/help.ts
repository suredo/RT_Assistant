/**
 * Role-aware help and onboarding messages.
 * Both functions are pure — no side effects, fully testable.
 */

export function formatWelcome(_role: 'rt' | 'team'): string {
  return `Olá! 👋 Sou a Bianca, assistente da clínica.\nDiga *ajuda* a qualquer momento para ver o que posso fazer.`;
}

export function formatHelp(role: 'rt' | 'team'): string {
  const demands = `*O que eu posso fazer:*

📋 *Registrar demandas*
→ "Falta EPI no estoque"
→ "Equipamento com defeito na sala 3"`;

  const workflows = `

🔄 *Acionar workflows*
→ "Fernando foi contratado"
→ "Inicie o processo de desligamento de Maria"`;

  const notes = `

✏️ *Adicionar notas em demandas*
→ "Adicionar nota na demanda 1: técnico foi acionado"`;

  const notifications = `

🔔 *Criar notificações e lembretes*
→ "Me lembre amanhã às 9h de verificar os equipamentos"
→ "Notificação toda segunda às 8h: revisar escala"`;

  if (role === 'team') return demands + workflows + notes + notifications;

  return demands + workflows + `

📊 *Consultar demandas*
→ "Quais demandas estão abertas?"
→ "Tem alguma urgência clínica pendente?"` + `

✏️ *Atualizar ou resolver demandas*
→ "A demanda 2 foi resolvida"
→ "Adicionar nota na demanda 1: técnico acionado"` + notifications + `

💬 *Discutir ideias*
→ "Me ajude a pensar em como reorganizar os turnos"

⚙️ *Gerenciar workflows*
→ "Lista os workflows"
→ "Crie um workflow para admissão de colaboradores"`;
}
