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
Nunca invente informações — se não souber, pergunte.`;

// Raw API call — passes messages directly, no system prompt injected.
// Used by classifier.ts which builds its own message array.
export async function chat(messages: Message[]): Promise<string> {
  const response = await axios.post(
    GLM_URL as string,
    { model: 'glm-4-flash', messages, temperature: 0.3 },
    { headers: { Authorization: `Bearer ${GLM_KEY}`, 'Content-Type': 'application/json' } }
  );
  return response.data.choices[0].message.content as string;
}

// Higher-level call for conversational replies — prepends SYSTEM_PROMPT automatically.
export async function reply(userMessage: string, history: Message[] = []): Promise<string> {
  try {
    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
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
