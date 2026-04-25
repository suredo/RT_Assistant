const axios = require('axios');
require('dotenv').config();

const GLM_URL = `${process.env.GLM_BASE_URL}/chat/completions`;
const GLM_KEY = process.env.GLM_API_KEY;

// Kept in Portuguese — the AI interacts with Bianca in Portuguese
const SYSTEM_PROMPT = `Você é um assistente da Enfermeira RT de uma clínica de hemodiálise.
Seu papel é ajudá-la a organizar demandas, registrar pendências e responder consultas sobre o que está em aberto.

Ao receber uma mensagem, identifique se é:
- Nova demanda (algo que precisa ser feito)
- Atualização de demanda existente (algo foi resolvido ou mudou)
- Consulta (ela quer saber o que está pendente, urgente, etc.)

Responda sempre em português, de forma direta e concisa.
Use emojis para indicar prioridade: 🔴 urgente, 🟡 média, ⚪ rotina.
Nunca invente informações — se não souber, pergunte.`;

// Raw API call — passes messages directly, no system prompt injected.
// Used by classifier.js which builds its own message array.
async function chat(messages) {
  const response = await axios.post(
    GLM_URL,
    { model: 'glm-4', messages, temperature: 0.3 },
    { headers: { Authorization: `Bearer ${GLM_KEY}`, 'Content-Type': 'application/json' } }
  );
  return response.data.choices[0].message.content;
}

// Higher-level call for conversational replies — prepends SYSTEM_PROMPT automatically.
async function reply(userMessage, history = []) {
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userMessage }
    ];
    return await chat(messages);
  } catch (error) {
    console.error('⚠️ GLM error:', error.response?.data || error.message);
    return '⚠️ Erro ao processar sua mensagem. Tente novamente.';
  }
}

module.exports = { chat, reply, SYSTEM_PROMPT };
