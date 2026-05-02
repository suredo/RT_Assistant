/**
 * Terminal REPL — test the bot without WhatsApp.
 *
 * Usage:
 *   npm run repl              # default: RT role
 *   npm run repl:team         # team member role
 *
 * Environment variables (optional):
 *   REPL_SENDER   phone number to use as the sender (default: 5511999999999)
 *   REPL_ROLE     "rt" or "team" (default: "rt")
 *
 * Special commands:
 *   /reset    clear conversation history and pending state
 *   /quit     exit
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as readline from 'readline';
import { handleMessage } from '../src/whatsapp/handler';
import { clearHistory, clearPendingAction, clearActiveWorkflow } from '../src/ai/context';

const SENDER = process.env.REPL_SENDER ?? '5511999999999';
const ROLE   = (process.env.REPL_ROLE   ?? 'rt') as 'rt' | 'team';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt() {
  rl.question('\nVocê: ', handleLine);
}

async function handleLine(input: string) {
  const text = input.trim();

  if (!text) { prompt(); return; }

  if (text === '/quit' || text === '/exit') {
    console.log('\nAté logo! 👋');
    rl.close();
    process.exit(0);
  }

  if (text === '/reset') {
    clearHistory(SENDER);
    clearPendingAction(SENDER);
    clearActiveWorkflow(SENDER);
    console.log('✅ Estado resetado — histórico e ações pendentes limpos.\n');
    prompt();
    return;
  }

  try {
    await handleMessage(text, SENDER, ROLE, async (response) => {
      console.log(`\nBianca: ${response}`);
    });
  } catch (err) {
    console.error('\n⚠️ Erro interno:', err);
  }

  prompt();
}

console.log('┌─────────────────────────────────────────┐');
console.log('│       RT Assistant — Terminal REPL       │');
console.log('├─────────────────────────────────────────┤');
console.log(`│  Remetente : ${SENDER.padEnd(27)}│`);
console.log(`│  Papel     : ${ROLE.padEnd(27)}│`);
console.log('├─────────────────────────────────────────┤');
console.log('│  /reset  limpar estado                  │');
console.log('│  /quit   sair                           │');
console.log('└─────────────────────────────────────────┘\n');

prompt();
