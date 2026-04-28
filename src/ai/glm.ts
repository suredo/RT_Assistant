import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const GLM_URL = `${process.env.GLM_BASE_URL}/chat/completions`;
const GLM_KEY = process.env.GLM_API_KEY;

// Kept in Portuguese — the AI interacts with Bianca in Portuguese
export const SYSTEM_PROMPT = `Você é um assistente da Enfermeira RT de uma clínica de hemodiálise.
Seu papel é ajudá-la a organizar demandas, registrar pendências e responder consultas sobre o que está em aberto.

Ao receber uma mensagem, identifique se é:
- Nova demanda (algo que precisa ser feito)
- Atualização de demanda existente (algo foi resolvido ou mudou)
- Consulta (ela quer saber o que está pendente, urgente, etc.)

Responda sempre em português, de forma direta e concisa.
Use emojis para indicar prioridade: 🔴 urgente, 🟡 média, ⚪ rotina.
Nunca invente informações — se não souber, pergunte.

Ao exibir demandas, siga estas regras de formatação sem exceção:
- Use SEMPRE a lista numerada simples: "1. 🔴 Resumo da demanda"
- Nunca use tabelas, listas com traço ou qualquer outro formato
- Nunca inclua categoria, status ou outros campos extras, a menos que a RT peça explicitamente
- Nunca reordene ou reagrupe as demandas — mantenha a ordem da lista fornecida`;

// Prompt for team members — restricted to adding demands only
export const TEAM_PROMPT = `Você é um assistente de registro de demandas de uma clínica de hemodiálise.
Sua função é APENAS receber e confirmar novas demandas ou informações da equipe.
NÃO responda consultas, relatórios, listagens ou perguntas sobre o status de demandas — isso é função exclusiva da RT.
Se alguém pedir informações ou consultas, responda educadamente que apenas a RT pode acessar essas informações.
Confirme sempre a demanda recebida com um resumo curto e o emoji de prioridade estimada: 🔴 urgente, 🟡 média, ⚪ rotina.`;

// Raw API call — passes messages directly, no system prompt injected.
// Used by classifier.ts which builds its own message array.
export async function chat(messages: Message[]): Promise<string> {
  const response = await axios.post(
    GLM_URL as string,
    { model: 'GLM-5', messages, temperature: 0 },
    { headers: { Authorization: `Bearer ${GLM_KEY}`, 'Content-Type': 'application/json' } }
  );
  return response.data.choices[0].message.content as string;
}

// Higher-level call for conversational replies — prepends the given prompt (defaults to SYSTEM_PROMPT).
export async function reply(userMessage: string, history: Message[] = [], prompt = SYSTEM_PROMPT): Promise<string> {
  try {
    const messages: Message[] = [
      { role: 'system', content: prompt },
      ...history,
      { role: 'user', content: userMessage }
    ];
    return await chat(messages);
  } catch (error: unknown) {
    const err = error as { response?: { data: unknown }; message: string };
    console.error('⚠️ GLM error:', err.response?.data ?? err.message);
    return '⚠️ Erro ao processar sua mensagem. Tente novamente.';
  }
}
