# RT Assistant — Development Document

> AI Assistant for the Head Nurse (RT) of a Hemodialysis Clinic  
> Status: **In Development — Week 4** | Last updated: April 2026

---

## 1. Context and Problem

The Head Nurse RT (Bianca) operates as the clinic's operational manager — equivalent to a clinical COO. Her routine is **completely reactive and unstructured**:

- Every day is different, with no fixed sequence of activities
- Demands arrive via WhatsApp and in person, with no record kept
- Prioritization is based on "visibility" — whatever is loudest, not what is most important
- Delegations are arranged on the spot and stored only in memory
- She cannot track tasks without actively asking the team
- No formal shift handover is performed
- The monthly ANVISA report takes 3 days to compile
- Adopting any new tool would require management approval

**The quote that sums up the problem:**
> *"I arrive, check what was left over, go up to my manager, come back down, receive demands — and when I look up, the day is already over."*

---

## 2. Proposed Solution

A **WhatsApp-based AI assistant** that acts as Bianca's external memory and central demand hub.

No new interface. No installation. No change in behavior.  
She talks to a number on WhatsApp — by typing or voice — and the AI organizes, prioritizes, and records everything.

### Why WhatsApp

- Channel she and the team already use daily
- Natively supports text and audio messages
- Zero adoption friction
- No management approval needed to start testing

### Technical Integration

Use **whatsapp-web.js** or **Baileys** to connect the AI to a regular WhatsApp number, without requiring the WhatsApp Business API.

> ⚠️ Technically against WhatsApp's Terms of Service. Risk is low for an internal pilot. Evaluate migration to the official API or Telegram if the project scales.

---

## 3. Phase Roadmap

### Phase 1 — MVP (Current development focus)

**Goal:** Solve the immediate problem of unstructured communication and unrecorded demands.

**What the AI does:**
- [x] Receive text messages from the RT
- [ ] Automatically transcribe audio messages (Week 4)
- [x] Classify each demand by category and urgency (Week 2)
- [x] Log demands with timestamp and context (Week 2)
- [x] Answer the RT's queries about open items (Week 2)
- [ ] Mark demands as resolved through conversation (Week 2)
- [x] Generate a daily briefing at the start of each shift (Week 3)
- [x] List what was left pending from the previous day (Week 3)

**Core commands — Phase 1:**

| What she says | What the AI does |
|---|---|
| "What was left pending from yesterday?" | Lists previous day's open items |
| "Note that I need to resolve X" | Logs a new demand |
| "What is urgent right now?" | Lists demands by priority |
| "X has been resolved" | Closes the demand and logs it |
| "Summarize my day" | Generates a shift summary |
| "Which reports are due this week?" | Lists reports by deadline |

**Demand categories:**

| Category | Examples | Default priority |
|---|---|---|
| Clinical urgent | Patient fall, incident, abnormal blood pressure | 🔴 High |
| Team management | Coverage, delegation, conflict | 🟡 Medium |
| Medical team | Requests and demands that bypass the RT | 🟡 Medium |
| Administrative | Supplies, materials, announcements | 🟡 Medium |
| Regulatory | Reports, ANVISA deadlines | 🟡 Medium |
| Routine | Periodic checks, general reminders | ⚪ Low |

---

### Phase 2 — Native Phone Integrations

**Goal:** Turn the assistant into the RT's personal productivity hub.

- [ ] Create calendar events through conversation
- [ ] Set alarms and reminders
- [x] Save important notes
- [ ] Automatic reminders for upcoming report deadlines

---

### Phase 3 — Team Expansion

**Goal:** The team also interacts with the assistant, giving the RT passive visibility.

- [ ] Nurses and technicians can open demands via WhatsApp
- [ ] RT receives categorized demand notifications from the team
- [ ] Demand history per team member
- [ ] RT stops being verbally interrupted for every issue

---

### Phase 4 — Reports and Regulatory

**Goal:** Reduce the 3-day ANVISA report compilation time.

- [ ] Automatic consolidation of records for the period
- [ ] Draft report generation based on logged history
- [ ] Deadline control with early alerts
- [ ] Export in a format compatible with the clinic's system

---

## 4. Technical Architecture — Phase 1

```
RT's WhatsApp
      ↓
whatsapp-web.js (Node.js)
      ↓
Message router
  ├── Audio? → Whisper API → text
  └── Text → continue
      ↓
Context builder
  ├── In-memory conversation buffer (last 10 turns)
  └── Open demands from Supabase (injected into system prompt)
      ↓
LLM (GLM dev / Claude prod)
      ↓
Intent resolver
  ├── new_demand → INSERT into Supabase
  ├── update     → UPDATE demand status
  └── query      → SELECT + format response
      ↓
Reply via WhatsApp
```

### Suggested stack

| Component | Primary option | Alternative |
|---|---|---|
| WhatsApp integration | whatsapp-web.js | Baileys (lighter, no browser dep.) |
| Backend | Node.js + Express | Python + FastAPI |
| LLM | GLM (Zhipu AI) — development | Claude Haiku → Claude Sonnet — production |
| Audio transcription | OpenAI Whisper API (no Python needed) | Local Whisper via child_process |
| Database | Supabase | Firebase |
| Hosting | Railway (persistent volumes ✅) | $5/month VPS (DigitalOcean, Hetzner) |

> ⚠️ **Render free tier** uses ephemeral disk — WhatsApp session is lost on every restart. Only use Render with a paid plan that includes persistent disk.

> **LLM strategy by phase:**
> - **Development and testing:** GLM (Zhipu AI) — lower cost, access already available. Do NOT use with real patient data — servers are located in China, outside LGPD jurisdiction.
> - **Pilot with real data:** Migrate to Claude (Anthropic) or GPT-4o under standard API terms.
> - **Formal production:** Claude or GPT-4o with a ZDR contract, or a self-hosted local model.

---

## 5. Development Environment

**Operating system:** Windows  
**Experience level:** Advanced  
**Already installed:** Node.js, Git

### Still needed

| Tool | Purpose | Where to get it |
|---|---|---|
| Python 3.11+ | Run Whisper for audio transcription | python.org |
| Supabase CLI | Manage database locally *(optional at first — use the web dashboard)* | supabase.com/docs/guides/cli |

### Project structure

```
rt-assistant/
├── src/
│   ├── whatsapp/
│   │   ├── client.ts        # whatsapp-web.js connection + reconnect logic
│   │   └── auth.ts          # role-based authorization (RT vs team vs unknown)
│   ├── ai/
│   │   ├── glm.ts           # GLM Zhipu integration (development)
│   │   ├── classifier.ts    # demand classification logic
│   │   └── context.ts       # per-sender conversation buffer
│   ├── audio/
│   │   └── transcribe.ts    # Whisper transcription
│   ├── db/
│   │   └── supabase.ts      # database access
│   └── index.ts             # application entry point
├── tests/                   # Jest test files (1:1 with src modules)
├── .env                     # API keys — never commit
├── .env.example             # template without real values
├── .gitignore
├── tsconfig.json
└── package.json
```

### Initial setup

```bash
# 1. Create the project
mkdir rt-assistant && cd rt-assistant
git init
npm init -y

# 2. Runtime dependencies
npm install whatsapp-web.js qrcode-terminal axios dotenv
npm install @supabase/supabase-js   # Week 2

# 3. TypeScript + test tooling
npm install --save-dev typescript ts-node ts-jest jest
npm install --save-dev @types/node @types/jest @types/qrcode-terminal
```

`package.json` scripts:
```json
{
  "scripts": {
    "start": "ts-node src/index.ts",
    "dev": "ts-node --watch src/index.ts",
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "jest"]
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Environment variables (.env)

```env
# LLM — Development
GLM_API_KEY=your_key_here
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4

# LLM — Production (swap in when moving to real data)
CLAUDE_API_KEY=your_key_here

# Audio transcription
OPENAI_API_KEY=your_key_here

# Database
SUPABASE_URL=your_url_here
SUPABASE_KEY=your_key_here

# RT's phone number — used for proactive messaging and authorization
RT_NUMBER=5563999999999
# RT's WhatsApp LID — set this if RT_NUMBER authorization fails.
# Newer WhatsApp versions use Linked Device IDs instead of phone numbers.
# Copy the value after "from:" in the ⚠️ warning log.
RT_LID=

# Team members — comma-separated, restricted to adding demands only
TEAM_NUMBERS=
TEAM_LIDS=

# Set to the assistant's number to link via pairing code instead of QR scan
PAIRING_NUMBER=

# Environment
NODE_ENV=development
```

> ⚠️ Add `.env` to `.gitignore` immediately — never commit API keys.

### Suggested development schedule

| Week | Focus |
|---|---|
| 1 | WhatsApp connection + basic GLM response |
| 2 | Demand classification + Supabase database |
| 3 | Daily briefing + pending items listing |
| 4 | Audio transcription + testing with Bianca |

---

## 5.1 GLM Integration (Zhipu AI)

GLM follows the OpenAI API standard, which makes future migration to Claude or GPT-4o straightforward — just swap the base URL and key.

### `src/ai/glm.ts`

```typescript
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

// Prompt for team members — restricted to adding demands only
export const TEAM_PROMPT = `Você é um assistente de registro de demandas de uma clínica de hemodiálise.
Sua função é APENAS receber e confirmar novas demandas ou informações da equipe.
NÃO responda consultas, relatórios, listagens ou perguntas sobre o status de demandas — isso é função exclusiva da RT.
Se alguém pedir informações ou consultas, responda educadamente que apenas a RT pode acessar essas informações.
Confirme sempre a demanda recebida com um resumo curto e o emoji de prioridade estimada: 🔴 urgente, 🟡 média, ⚪ rotina.`;

// Raw API call — passes messages directly. Used by classifier.ts which builds its own array.
export async function chat(messages: Message[]): Promise<string> {
  const response = await axios.post(
    GLM_URL as string,
    { model: 'GLM-4.7', messages, temperature: 0.3 },
    { headers: { Authorization: `Bearer ${GLM_KEY}`, 'Content-Type': 'application/json' } }
  );
  return response.data.choices[0].message.content as string;
}

// Higher-level call — prepends the given prompt (defaults to SYSTEM_PROMPT).
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
```

---

## 5.2 Database Schema — Demands Table

Created in Week 2 via the Supabase dashboard or SQL editor.

```sql
CREATE TABLE demands (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  message     TEXT        NOT NULL,          -- original message from Bianca
  summary     TEXT,                          -- AI-generated short description
  category    TEXT        NOT NULL,          -- clinical_urgent | team_management | medical_team | administrative | regulatory | routine
  priority    TEXT        NOT NULL,          -- high | medium | low
  status      TEXT        NOT NULL DEFAULT 'open',  -- open | resolved
  resolved_at TIMESTAMPTZ,
  source      TEXT        DEFAULT 'rt'       -- 'rt' | 'team' (Phase 3)
);

-- Auto-update updated_at on every change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER demands_updated_at
  BEFORE UPDATE ON demands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Useful queries:
```sql
-- All open demands, newest first
SELECT * FROM demands WHERE status = 'open' ORDER BY created_at DESC;

-- High priority open demands
SELECT * FROM demands WHERE status = 'open' AND priority = 'high';

-- Demands from last 7 days
SELECT * FROM demands WHERE created_at > now() - INTERVAL '7 days';
```

---

## 5.3 Conversation Context Strategy

The assistant needs two types of memory to answer questions coherently:

### 1. Short-term: in-memory conversation buffer

Keep a per-sender buffer of the last 10 message exchanges. This lets the AI refer to the current conversation without re-reading the database.

```javascript
// src/ai/context.js
const buffers = new Map();  // key: sender phone number

function getHistory(sender) {
  return buffers.get(sender) || [];
}

function addTurn(sender, role, content) {
  const history = getHistory(sender);
  history.push({ role, content });
  if (history.length > 20) history.splice(0, 2);  // keep last 10 pairs
  buffers.set(sender, history);
}

module.exports = { getHistory, addTurn };
```

### 2. Long-term: open demands injected into the system prompt

Before calling the LLM, fetch open demands from Supabase and append them to the system prompt. This lets the AI answer "what is pending?" accurately.

```javascript
// Example: inject open demands into the system prompt
async function buildSystemPrompt() {
  const { data: demands } = await supabase
    .from('demands')
    .select('summary, category, priority, created_at')
    .eq('status', 'open')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });

  const demandList = demands.length
    ? demands.map(d => `- [${d.priority}] ${d.summary} (${d.category})`).join('\n')
    : 'Nenhuma demanda em aberto.';

  return `${BASE_SYSTEM_PROMPT}\n\n## Demandas em aberto (últimos 7 dias):\n${demandList}`;
}
```

This approach keeps the LLM stateless (no session memory) while giving it accurate, up-to-date context on every call.

---

## 6. Decisions

| Decision | Answer |
|---|---|
| **WhatsApp number** | Dedicated secondary number — never use a personal number |
| **Server hosting** | Railway (cloud, persistent volumes) or a $5/month VPS — not a local machine |
| **Session persistence** | `LocalAuth` + persistent volume on the host; document QR re-scan recovery steps |
| **Management approval** | Defer until a working prototype exists — a demo is a stronger pitch than a slide deck |
| **AI tone** | Informal — Bianca uses WhatsApp informally; formal tone would feel unnatural |
| **Context window** | Last 7 days of open demands + full conversation history for the current day |
| **Data backup** | Supabase automated daily backups + weekly JSON export via a scheduled script |
| **LGPD compliance** | Apply Section 6.1 from day 1 — no real patient names in dev/test data |

---

### 6.1 LGPD (Brazilian Data Protection Law) Guidelines

Patient names and dates of birth **are already sensitive personal data under LGPD** when associated with a health context — regardless of CPF or ID number. The assistant must handle this data under the following guidelines:

#### Storage
- Personal data stored with **encryption at rest** (e.g. AES-256)
- Never in plain text in the database
- Access restricted — system only, never exposed in logs

#### Transit
- WhatsApp already has **end-to-end encryption** — channel is covered
- Communication between the server and the LLM must use HTTPS

#### Retention
- Define a clear policy for how long data is stored
- Closed demand records: suggested 90-day retention, then anonymization or deletion

#### Purpose
- Data used **exclusively** for the RT's demand management
- Never used to train models or for any other purpose

#### LLM data retention (third parties)

| LLM | By default | With ZDR contract |
|---|---|---|
| GLM (Zhipu AI) | Servers in China — outside LGPD jurisdiction; not recommended for patient data in production | No equivalent ZDR option publicly documented |
| Claude (Anthropic) | Does not use data for training; may retain temporarily for safety monitoring | Zero retention guaranteed — available on Enterprise plan upon formal request |
| GPT-4o (OpenAI) | Does not use data for training; retains for up to 30 days | Zero retention guaranteed — available on Enterprise plan upon formal request |
| Local model (LLaMA / Mistral) | No data leaves the own server | Ideal long-term solution — higher infrastructure cost |

#### Strategy by phase

| Phase | Recommended approach |
|---|---|
| Pilot | Standard API terms (Claude or GPT-4o) — acceptable for restricted scope |
| Formal production | ZDR contract with chosen LLM provider |
| Scale / critical data | Evaluate local model to eliminate third-party dependency |

---

## 7. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| WhatsApp banning the number | Low (internal pilot) | Use a secondary number; migrate to official API if scaling |
| Bianca not adopting the habit | Medium | Start with a single simple use case — morning briefing |
| Management not approving | Medium | Pitch focused on ANVISA compliance and traceability, not AI |
| AI misclassifying a demand | Medium | Bianca can correct via conversation; use corrections to improve |
| Sensitive patient data | High attention | Name + DOB are sensitive under LGPD; apply encryption, retention policy, and ZDR per section 6.1 |
| WhatsApp session lost on cloud restart | Medium | Chat-history sync on restart (see Section 14) recovers missed demands automatically — at most 5 minutes of uncertainty (heartbeat interval) |

---

## 8. Pilot Success Criteria

The pilot will be considered successful after 30 days if:

- Bianca can know what was left pending from the previous day without asking anyone
- At least 80% of shift demands are logged in the assistant
- She uses the assistant spontaneously, without being reminded
- Management sees enough value to continue and expand

---

## 9. Next Steps

| # | Action | Owner | Status |
|---|---|---|---|
| 1 | Validate Phase 1 structure with Bianca | Business | 🔲 Pending |
| 2 | Define tech stack and development environment | Tech | ✅ Done |
| 3 | Build conversation prototype (message flows) | Tech | 🔲 Pending |
| 4 | Prepare pitch for clinic management | Business | 🔲 Pending |
| 5 | Set up server and WhatsApp integration | Tech | ✅ Done |
| 6 | Develop Phase 1 — MVP | Tech | 🔄 In progress (Week 4 of 4) |
| 7 | Test with Bianca for 2 weeks | Tech + Business | 🔲 Pending |
| 8 | Collect feedback and iterate | Tech | 🔲 Pending |

---

## 10. Week 1 — WhatsApp Connection + Basic GLM Response

**Goal:** Have the assistant connected to WhatsApp, receiving messages and responding via GLM. No database yet — full focus on validating the end-to-end flow.

---

### 10.1 Prerequisites

Before starting, make sure you have:

- [x] Node.js installed (`node -v` in the terminal)
- [x] Git installed (`git -v` in the terminal)
- [x] GLM API key ready
- [x] A **secondary WhatsApp number** available to act as the assistant (do not use your personal number)

---

### 10.2 Creating the project

```bash
# Create folder and initialize project
mkdir rt-assistant
cd rt-assistant
git init
npm init -y

# Install Week 1 dependencies
npm install whatsapp-web.js qrcode-terminal axios dotenv

# Create folder structure
mkdir -p src/whatsapp src/ai

# Create .gitignore immediately
echo "node_modules/\n.env\n.wwebjs_auth/\n.wwebjs_cache/" > .gitignore
```

---

### 10.3 Environment variables

Create `.env.example` to document variables without exposing values (copy to `.env` and fill in real values):

```env
GLM_API_KEY=
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
CLAUDE_API_KEY=
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
# RT's phone number — used for proactive messaging and authorization
RT_NUMBER=
# RT's WhatsApp LID — set if RT_NUMBER authorization fails (copy from ⚠️ warning log)
RT_LID=
# Comma-separated team numbers — restricted to adding demands only
TEAM_NUMBERS=
# Comma-separated team LIDs — fallback for team members triggering authorization failures
TEAM_LIDS=
# Set to the assistant's number to link via pairing code instead of QR scan
PAIRING_NUMBER=
NODE_ENV=development
```

---

### 10.4 GLM module

See Section 5.1 for the full `src/ai/glm.ts` implementation.

Key exports:
- `chat(messages)` — raw API call, used by `classifier.ts`
- `reply(userMessage, history?, prompt?)` — prepends system prompt, used by `client.ts`
- `SYSTEM_PROMPT` — full RT prompt (queries, management, status)
- `TEAM_PROMPT` — restricted prompt (add demands only)
- `Message` — TypeScript interface `{ role: 'system'|'user'|'assistant', content: string }`

---

### 10.5 WhatsApp client + authorization

Two files work together:

**`src/whatsapp/auth.ts`** — maps sender identifier to a role:

```typescript
export type Role = 'rt' | 'team';

function parseList(env: string | undefined): string[] {
  return (env ?? '').split(',').map(n => n.trim()).filter(Boolean);
}

export function getRtNumbers(): string[] { return parseList(process.env.RT_NUMBER); }
export function getRtLids(): string[]    { return parseList(process.env.RT_LID); }

export function getRole(from: string): Role | null {
  if ([...getRtNumbers(), ...getRtLids()].some(n => from.includes(n))) return 'rt';

  const team = parseList(process.env.TEAM_NUMBERS);
  const teamLids = parseList(process.env.TEAM_LIDS);
  if ([...team, ...teamLids].some(n => from.includes(n))) return 'team';

  return null;
}
```

`RT_NUMBER` and `RT_LID` both accept **comma-separated values**, enabling multiple RT identities (e.g. two phones for the same person):

```
RT_NUMBER=5511999999999,5522888888888
RT_LID=262538902147114,999888777666555
```

`getRtNumbers()` / `getRtLids()` parse these into arrays and are used by `sync.ts` (loops over every RT chat) and `briefing.ts` (sends morning briefing to all RT numbers in parallel). Single-value configs continue to work unchanged.

> ⚠️ Newer WhatsApp versions use Linked Device IDs (`@lid`) instead of phone numbers. `msg.getContact()` resolves the actual identifier — use `RT_LID` / `TEAM_LIDS` if authorization fails with just phone numbers.

**`src/whatsapp/client.ts`** — connection, QR/pairing code, reconnect, message routing:

```typescript
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { reply, SYSTEM_PROMPT, TEAM_PROMPT } from '../ai/glm';
import { getRole } from './auth';

async function createClient(): Promise<void> {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  });

  client.on('qr', async (qr: string) => {
    const pairingNumber = process.env.PAIRING_NUMBER;
    if (pairingNumber) {
      try {
        const code = await client.requestPairingCode(pairingNumber);
        console.log(`\n🔑 Código de pareamento: ${code}`);
        console.log('No WhatsApp: Configurações > Aparelhos conectados > Conectar aparelho > Conectar com número de telefone\n');
      } catch {
        console.log('\n📱 Falha ao gerar código — escaneie o QR Code abaixo:\n');
        qrcode.generate(qr, { small: true });
      }
    } else {
      console.log('\n📱 Escaneie o QR Code abaixo com o número do assistente:\n');
      qrcode.generate(qr, { small: true });
    }
  });

  client.on('ready', () => console.log('✅ RT Assistant conectado e pronto'));
  client.on('auth_failure', () => console.error('❌ Falha na autenticação — delete .wwebjs_auth e tente novamente'));

  client.on('disconnected', async (reason: string) => {
    console.warn('⚠️ Desconectado:', reason);
    try { await client.destroy(); } catch { /* ignore */ }
    setTimeout(createClient, 5000);
  });

  client.on('message', async (msg) => {
    if (msg.from.includes('@g.us') || msg.fromMe) return;

    // msg.from may be an @lid — resolve contact to get the stable identifier
    const contact = await msg.getContact();
    const senderNumber = contact.number || msg.from;

    const role = getRole(senderNumber);
    if (!role) {
      console.warn(`⚠️ Mensagem ignorada de número não autorizado: ${senderNumber}`);
      return;
    }

    console.log(`\n📩 [${new Date().toLocaleTimeString()}] [${role}] ${senderNumber}: ${msg.body}`);

    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const prompt = role === 'rt' ? SYSTEM_PROMPT : TEAM_PROMPT;
    const response = await reply(msg.body, [], prompt);

    console.log(`🤖 Resposta: ${response}\n`);
    await msg.reply(response);
  });

  // Catch ProtocolError from a still-locked Chrome user data dir — retry with fresh instance
  try {
    await client.initialize();
  } catch (err) {
    console.error('⚠️ Erro na inicialização, tentando novamente em 10s:', err);
    try { await client.destroy(); } catch { /* ignore */ }
    setTimeout(createClient, 10000);
  }
}

export function start(): void {
  createClient().catch(err => console.error('⚠️ Falha fatal ao iniciar cliente:', err));
}
```

---

### 10.6 Application entry point

```typescript
// src/index.ts
import dotenv from 'dotenv';
dotenv.config();

import { start } from './whatsapp/client';

console.log('🚀 Iniciando RT Assistant...');
start();
```

---

### 10.7 Running for the first time

**Option A — QR Code (default):**
```bash
npm start
# Terminal shows a QR Code
# WhatsApp on the assistant number > Linked Devices > Link a Device > scan
```

**Option B — Pairing code:**
```bash
# Add to .env:
PAIRING_NUMBER=5563999999999   # assistant's number

npm start
# Terminal shows: 🔑 Código de pareamento: ABCD-1234
# WhatsApp > Configurações > Aparelhos conectados > Conectar com número de telefone
```

After connecting: `✅ RT Assistant conectado e pronto`

---

### 10.8 Testing the flow

Send test messages from the RT number to the assistant number:

| Test message | What to validate |
|---|---|
| `"oi"` | Assistant responds in Portuguese |
| `"o que está pendente?"` | Lists open demands from Supabase (or "Nenhuma demanda em aberto" if empty) |
| `"paciente na cadeira 3 com pressão baixa"` | Classified as clinical urgent |
| `"preciso cobrir o turno amanhã"` | Classified as team management |
| Message from an unknown number | No reply; warning logged |
| Message from a TEAM_NUMBERS entry | Restricted response — add demands only |

---

### 10.9 Common issues

| Issue | Likely cause | Solution |
|---|---|---|
| QR Code doesn't appear | Puppeteer not installed | `npm install puppeteer` |
| `ProtocolError` on reconnect | Stale Chrome lock | Handled automatically — waits 10s and retries |
| Disconnects on its own | Session expired | Handled automatically — reconnects after 5s |
| GLM 401 error | Invalid API key | Check `.env` |
| GLM 1211 error | Invalid model name | Verify model is `GLM-4.7` in `src/ai/glm.ts` |
| Authorization failing for RT | WhatsApp using LID | Copy value from warning log into `RT_LID` in `.env` |
| `Cannot find module` | Missing dependency | `npm install` |

---

### 10.10 Week 1 completion checklist

Week 1 is complete when:

- [x] Project created and versioned in Git
- [x] TypeScript configured (`tsconfig.json`, `ts-jest`)
- [x] Assistant connects to WhatsApp without errors
- [x] Session persists after restart (`npm start` doesn't ask for QR/code again)
- [x] QR Code and pairing code linking both work
- [x] Text messages are received and answered by GLM
- [x] Role-based authorization — RT gets full access, team gets restricted, unknown ignored
- [x] Logs appear correctly in terminal with role label (`[rt]` / `[team]`)
- [x] Auto-reconnect works after a drop (ProtocolError handled)

---

---

## 11. Week 2 — Demand Persistence + Basic Queries

**Goal:** Every message classified as a demand is saved to Supabase, and Bianca can query what is open, urgent, or pending.

---

### 11.1 Prerequisites

- [ ] Supabase project created (web dashboard — no CLI needed)
- [ ] Demands table created (see Section 5.2)
- [ ] `SUPABASE_URL` and `SUPABASE_KEY` added to `.env`

---

### 11.2 Supabase module

```javascript
// src/db/supabase.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function saveDemand({ message, summary, category, priority }) {
  const { data, error } = await supabase
    .from('demands')
    .insert({ message, summary, category, priority })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function resolveDemand(id) {
  const { error } = await supabase
    .from('demands')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function getOpenDemands({ days = 7, priority } = {}) {
  let query = supabase
    .from('demands')
    .select('*')
    .eq('status', 'open')
    .gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
    .order('created_at', { ascending: false });

  if (priority) query = query.eq('priority', priority);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

module.exports = { saveDemand, resolveDemand, getOpenDemands };
```

---

### 11.3 Updated message handler

```javascript
// src/index.js (Week 2 update)
const { classify } = require('./ai/classifier');
const { reply, buildSystemPrompt } = require('./ai/glm');
const { getHistory, addTurn } = require('./ai/context');
const { saveDemand, getOpenDemands } = require('./db/supabase');

client.on('message', async msg => {
  if (msg.from.includes('@g.us') || msg.fromMe) return;

  const chat = await msg.getChat();
  await chat.sendStateTyping();

  // Classify the incoming message
  const classification = await classify(msg.body);

  // Save to DB if it's a new demand
  if (classification.type === 'new_demand') {
    await saveDemand({
      message: msg.body,
      summary: classification.summary,
      category: classification.category,
      priority: classification.priority
    });
  }

  // Build context-aware system prompt
  const systemPrompt = await buildSystemPrompt();

  // Add user turn to buffer, get LLM response
  addTurn(msg.from, 'user', msg.body);
  const history = getHistory(msg.from);
  const response = await reply(msg.body, history, systemPrompt);
  addTurn(msg.from, 'assistant', response);

  await msg.reply(response);
});
```

---

### 11.4 Week 2 completion checklist

- [x] Demands saved to Supabase after every new demand message
- [x] "What is pending?" returns open demands from the database
- [x] "What is urgent?" returns only high-priority open items
- [x] Conversation buffer keeps context across a multi-message exchange
- [x] No data lost if the bot restarts (database is the source of truth)

---

## 12. Week 3 — Daily Briefing + Shift Summary

**Goal:** Bianca receives a morning briefing automatically at shift start, and can ask for a shift summary at any time.

---

### 12.1 Proactive morning briefing

A cron job runs at shift start (e.g. 06:30) and pushes a message to Bianca's number.

```javascript
// src/briefing.js
const cron = require('node-cron');
const { getOpenDemands } = require('./db/supabase');

function startBriefingSchedule(client) {
  // Every weekday at 06:30
  cron.schedule('30 6 * * 1-5', async () => {
    const demands = await getOpenDemands({ days: 1 });
    const high = demands.filter(d => d.priority === 'high');
    const others = demands.filter(d => d.priority !== 'high');

    let text = '☀️ *Bom dia, Bianca!* Aqui está seu resumo do turno:\n\n';

    if (high.length) {
      text += `🔴 *Urgente (${high.length}):*\n`;
      high.forEach(d => { text += `  • ${d.summary}\n`; });
      text += '\n';
    }

    if (others.length) {
      text += `🟡 *Pendente (${others.length}):*\n`;
      others.forEach(d => { text += `  • ${d.summary}\n`; });
    }

    if (!demands.length) {
      text += '✅ Nenhuma pendência das últimas 24h.';
    }

    const rtNumber = `${process.env.RT_NUMBER}@c.us`;
    await client.sendMessage(rtNumber, text);
  });
}

module.exports = { startBriefingSchedule };
```

Add to `src/index.js`:
```javascript
const { startBriefingSchedule } = require('./briefing');
// ...
client.on('ready', () => {
  console.log('✅ RT Assistant connected and ready');
  startBriefingSchedule(client);
});
```

Install cron:
```bash
npm install node-cron
```

---

### 12.2 On-demand shift summary command

When Bianca says "resume meu dia" or similar, the LLM generates a summary of everything logged during the current shift. This is handled automatically by the context-aware system prompt (Section 5.3) — no special command parsing needed.

---

### 12.3 Week 3 completion checklist

- [x] Morning briefing sent automatically at shift start
- [x] "Summarize my day" returns a formatted shift summary
- [x] "What was left from yesterday?" correctly queries the previous day
- [x] Briefing includes correct count of high-priority vs. other open items
- [x] No duplicate briefings if the server restarts mid-morning

---

## 13. Week 4 — Audio Transcription + Testing with Bianca

**Goal:** Voice messages are transcribed and processed identically to text. Bianca does a 2-week testing session.

---

### 13.1 Audio transcription via Whisper API

No Python required — uses the OpenAI Whisper API directly from Node.js.

```javascript
// src/audio/transcribe.js
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

async function transcribeAudio(audioBuffer, mimeType = 'audio/ogg') {
  const form = new FormData();
  form.append('file', audioBuffer, { filename: 'audio.ogg', contentType: mimeType });
  form.append('model', 'whisper-1');
  form.append('language', 'pt');  // Portuguese

  const response = await axios.post(
    'https://api.openai.com/v1/audio/transcriptions',
    form,
    {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  return response.data.text;
}

module.exports = { transcribeAudio };
```

---

### 13.2 Handling audio messages in the WhatsApp client

```javascript
// Add to the message handler in src/index.js
client.on('message', async msg => {
  if (msg.from.includes('@g.us') || msg.fromMe) return;

  let text = msg.body;

  // Handle voice messages
  if (msg.hasMedia && msg.type === 'ptt') {
    const media = await msg.downloadMedia();
    const audioBuffer = Buffer.from(media.data, 'base64');
    text = await transcribeAudio(audioBuffer, media.mimetype);
    console.log(`🎙️ Transcribed: ${text}`);
  }

  if (!text) return;

  // ... rest of message processing unchanged
});
```

---

### 13.3 Testing script for Bianca

Before the live test session, run through these scenarios:

| Scenario | Expected behavior |
|---|---|
| Send a voice note: "preciso cobrir o turno amanhã" | Transcribed, classified as team_management/medium, saved |
| Send text: "paciente na cadeira 5 com pressão baixa" | Classified as clinical_urgent/high, saved |
| Send: "o que está urgente agora?" | Returns only high-priority open demands |
| Send: "resolvi o problema da cadeira 5" | AI updates the relevant demand to resolved |
| Restart the server; send: "o que está pendente?" | Returns same open demands — database is the source of truth |
| Morning briefing (trigger manually for testing) | Correct count and list of open items |

---

### 13.4 Week 4 completion checklist

- [ ] Voice messages transcribed correctly in Portuguese
- [ ] Audio demands saved and classified same as text
- [ ] All Week 3 briefing features still work after audio integration
- [ ] 2-week test session started with Bianca
- [ ] Feedback log started for corrections and improvements

---

---

## 14. Testing Strategy

**Framework:** Jest  
**Philosophy:** Unit-test pure logic aggressively; mock all external I/O (LLM, WhatsApp, Supabase); cover the WhatsApp end-to-end flow with a manual smoke test checklist.

---

### 14.1 Setup

```bash
npm install --save-dev jest ts-jest typescript ts-node @types/jest @types/node
```

`package.json`:
```json
{
  "scripts": {
    "start": "ts-node src/index.ts",
    "dev": "ts-node --watch src/index.ts",
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node"
  }
}
```

**Test folder structure:**
```
rt-assistant/
├── src/
│   ├── whatsapp/
│   │   ├── auth.ts
│   │   └── client.ts
│   ├── ai/
│   │   ├── classifier.ts
│   │   ├── context.ts
│   │   └── glm.ts
│   ├── audio/transcribe.ts
│   ├── db/supabase.ts
│   ├── briefing.ts
│   └── index.ts
└── tests/
    ├── auth.test.ts
    ├── glm.test.ts
    ├── classifier.test.ts
    ├── context.test.ts
    ├── supabase.test.ts
    └── briefing.test.ts
```

To get a typed mock of `axios.post`, use `jest.mocked()`:
```typescript
import axios from 'axios';
jest.mock('axios');
const mockPost = jest.mocked(axios.post);
// mockPost.mockResolvedValue({ data: { choices: [...] } });
```

---

### 14.2 Classifier — JSON parsing (highest risk)

The classifier calls the LLM and parses its JSON response. The fallback when the LLM returns malformed JSON is critical — a broken classifier silently loses demand data.

```typescript
// tests/classifier.test.ts
import { classify } from '../src/ai/classifier';
import { chat } from '../src/ai/glm';

jest.mock('../src/ai/glm');
const mockChat = jest.mocked(chat);

describe('classify()', () => {
  beforeEach(() => jest.clearAllMocks());

  test('parses valid JSON from LLM', async () => {
    mockChat.mockResolvedValue(JSON.stringify({
      category: 'clinical_urgent',
      priority: 'high',
      type: 'new_demand',
      summary: 'Patient in chair 3 with low blood pressure'
    }));

    const result = await classify('patient in chair 3 with low blood pressure');

    expect(result.category).toBe('clinical_urgent');
    expect(result.priority).toBe('high');
    expect(result.type).toBe('new_demand');
    expect(result.summary).toBeTruthy();
  });

  test('falls back gracefully when LLM returns malformed JSON', async () => {
    mockChat.mockResolvedValue('Sorry, I could not classify this.');

    const result = await classify('some message');

    expect(result.category).toBe('routine');
    expect(result.priority).toBe('low');
    expect(result.type).toBe('new_demand');
  });

  test('falls back gracefully when LLM returns empty response', async () => {
    mockChat.mockResolvedValue('');

    const result = await classify('some message');

    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('priority');
  });

  test('falls back gracefully when LLM call throws', async () => {
    mockChat.mockRejectedValue(new Error('API timeout'));

    await expect(classify('some message')).resolves.toHaveProperty('category');
  });
});
```

> ⚠️ `classifier.ts` must wrap the entire function in try/catch — not just the JSON parse — so LLM exceptions also return the safe fallback.

---

### 14.3 Context buffer — conversation history

```typescript
// tests/context.test.ts
import { getHistory, addTurn } from '../src/ai/context';

describe('conversation buffer', () => {
  const sender = '5563999999999';

  beforeEach(() => jest.resetModules());

  test('returns empty array for a new sender', () => {
    expect(getHistory('unknown')).toEqual([]);
  });

  test('stores and retrieves turns correctly', () => {
    addTurn(sender, 'user', 'hello');
    addTurn(sender, 'assistant', 'hi there');

    const history = getHistory(sender);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', content: 'hello' });
    expect(history[1]).toEqual({ role: 'assistant', content: 'hi there' });
  });

  test('trims buffer to last 10 exchanges (20 turns)', () => {
    for (let i = 0; i < 15; i++) {
      addTurn(sender, 'user', `message ${i}`);
      addTurn(sender, 'assistant', `response ${i}`);
    }

    const history = getHistory(sender);
    expect(history.length).toBe(20);
    expect(history[0].content).toBe('message 5');
  });

  test('different senders have independent buffers', () => {
    addTurn('sender_a', 'user', 'message from A');
    addTurn('sender_b', 'user', 'message from B');

    expect(getHistory('sender_a')).toHaveLength(1);
    expect(getHistory('sender_b')).toHaveLength(1);
    expect(getHistory('sender_a')[0].content).toBe('message from A');
  });
});
```

---

### 14.4 Supabase module — mocked client

Mock `@supabase/supabase-js` so no real network calls happen. These tests verify the query logic (filters, field names) without needing a live database.

```typescript
// tests/supabase.test.ts

const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockGte = jest.fn();
const mockOrder = jest.fn();
const mockSingle = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
      eq: mockEq,
      gte: mockGte,
      order: mockOrder,
      single: mockSingle
    })
  })
}));

import { saveDemand, resolveDemand, getOpenDemands } from '../src/db/supabase';

describe('saveDemand()', () => {
  test('calls insert with all required fields', async () => {
    mockInsert.mockReturnValue({ select: () => ({ single: () => ({ data: { id: '123' }, error: null }) }) });

    await saveDemand({
      message: 'patient fell',
      summary: 'Patient fall',
      category: 'clinical_urgent',
      priority: 'high'
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'patient fell',
        category: 'clinical_urgent',
        priority: 'high'
      })
    );
  });

  test('throws when Supabase returns an error', async () => {
    mockInsert.mockReturnValue({
      select: () => ({ single: () => ({ data: null, error: new Error('DB error') }) })
    });

    await expect(saveDemand({ message: 'x', summary: 'x', category: 'routine', priority: 'low' }))
      .rejects.toThrow('DB error');
  });
});

describe('getOpenDemands()', () => {
  test('filters by status=open and date range', async () => {
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue({ data: [], error: null });

    await getOpenDemands({ days: 7 });

    expect(mockEq).toHaveBeenCalledWith('status', 'open');
    expect(mockGte).toHaveBeenCalledWith('created_at', expect.any(String));
  });

  test('adds priority filter when provided', async () => {
    const mockEq2 = jest.fn().mockReturnValue({ order: mockOrder });
    mockEq.mockReturnValueOnce({ gte: mockGte })   // status filter
          .mockReturnValueOnce(mockEq2);             // would be priority filter
    mockGte.mockReturnValue({ order: mockOrder, eq: mockEq2 });
    mockOrder.mockReturnValue({ data: [], error: null });

    await getOpenDemands({ days: 7, priority: 'high' });

    expect(mockEq).toHaveBeenCalledWith('priority', 'high');
  });
});
```

---

### 14.5 Briefing formatter

Test the message formatting logic independently from the cron schedule and the WhatsApp client.

```typescript
// tests/briefing.test.ts
// formatBriefing() must be exported from src/briefing.ts for this to work
import { formatBriefing } from '../src/briefing';

describe('formatBriefing()', () => {
  test('returns a no-pending message when demands is empty', () => {
    const msg = formatBriefing([]);
    expect(msg).toContain('Nenhuma pendência');
  });

  test('lists high-priority demands under the urgent section', () => {
    const demands = [
      { priority: 'high', summary: 'Patient fall in chair 3' },
      { priority: 'medium', summary: 'Supply request pending' }
    ];
    const msg = formatBriefing(demands);
    expect(msg).toContain('🔴');
    expect(msg).toContain('Patient fall in chair 3');
    expect(msg).toContain('🟡');
    expect(msg).toContain('Supply request pending');
  });

  test('shows only urgent section when all demands are high priority', () => {
    const demands = [{ priority: 'high', summary: 'Urgent item' }];
    const msg = formatBriefing(demands);
    expect(msg).toContain('🔴');
    expect(msg).not.toContain('🟡');
  });

  test('shows correct counts', () => {
    const demands = [
      { priority: 'high', summary: 'A' },
      { priority: 'high', summary: 'B' },
      { priority: 'medium', summary: 'C' }
    ];
    const msg = formatBriefing(demands);
    expect(msg).toContain('(2)');  // urgent count
    expect(msg).toContain('(1)');  // other count
  });
});
```

> For these tests to work, extract the formatting logic from `startBriefingSchedule()` into a standalone exported function `formatBriefing(demands)`.

---

### 14.6 Code change required: extract `formatBriefing`

The `briefing.ts` in Section 12.1 has the formatting logic inlined inside the cron callback. Separate it:

```typescript
// src/briefing.ts — updated
export function formatBriefing(demands: Array<{ priority: string; summary: string }>): string {
  const high = demands.filter(d => d.priority === 'high');
  const others = demands.filter(d => d.priority !== 'high');

  let text = '☀️ *Bom dia, Bianca!* Aqui está seu resumo do turno:\n\n';

  if (high.length) {
    text += `🔴 *Urgente (${high.length}):*\n`;
    high.forEach(d => { text += `  • ${d.summary}\n`; });
    text += '\n';
  }

  if (others.length) {
    text += `🟡 *Pendente (${others.length}):*\n`;
    others.forEach(d => { text += `  • ${d.summary}\n`; });
  }

  if (!demands.length) {
    text += '✅ Nenhuma pendência das últimas 24h.';
  }

  return text;
}

export function startBriefingSchedule(client: Client): void {
  cron.schedule('30 6 * * 1-5', async () => {
    const demands = await getOpenDemands({ days: 1 });
    const text = formatBriefing(demands);
    await client.sendMessage(`${process.env.RT_NUMBER}@c.us`, text);
  });
}
```

---

### 14.7 Manual smoke test checklist (pre-deploy / post-feature)

Run this checklist against the live bot before shipping any feature:

| # | Action | Expected result |
|---|---|---|
| 1 | `npm test` | All unit tests pass |
| 2 | `npm start` | Bot connects, QR scan or session restored |
| 3 | Send: `"oi"` | Bot replies in Portuguese, contextually |
| 4 | Send: `"paciente na cadeira 3 com pressão baixa"` | Bot confirms a clinical_urgent demand was logged |
| 5 | Send: `"o que está urgente agora?"` | Returns the demand from step 4 |
| 6 | Send: `"resolvi o problema da cadeira 3"` | Bot confirms the demand was closed |
| 7 | Send: `"o que está urgente agora?"` again | Demand from step 4 no longer listed |
| 8 | Restart the server (`Ctrl+C` then `npm start`) | Session restored without QR scan; demand from step 4 still resolved |
| 9 | Trigger briefing manually | Correct count and list; no duplicate sends |
| 10 | Send a voice note: `"preciso cobrir o turno amanhã"` | Transcribed, classified as team_management, saved |

---

### 14.8 What we deliberately do NOT test

| What | Why |
|---|---|
| LLM response quality | Non-deterministic; test the interface contract (JSON structure), not the content |
| WhatsApp connection and QR scan | Requires a live phone and WhatsApp session — can't automate |
| Whisper transcription accuracy | Third-party service; test only that the API call is constructed correctly |
| Full message flow end-to-end | Covered by the manual smoke test checklist |

---

---

## 15. Crash-Recovery Sync

### Overview

When the bot process restarts (crash, redeploy, or manual restart), any messages Bianca sent during the downtime are replayed from WhatsApp chat history. This prevents demands from being silently lost.

### How it works

| Component | File | Role |
|---|---|---|
| `bot_state` Supabase table | — | Single-row store for `last_active_at` timestamp |
| `getLastActive` / `setLastActive` | `src/db/botState.ts` | Read and write the watermark |
| `syncMissedDemands(client)` | `src/sync.ts` | Runs on `ready` — replays missed demands |
| `startHeartbeat()` | `src/briefing.ts` | Cron every 5 min — keeps watermark current |

### Sync flow

1. On `ready`, read `last_active_at` from Supabase → get Unix watermark
2. `getChatById(RT_LID@lid or RT_NUMBER@c.us)` → fetch up to 100 messages
3. Filter: `timestamp > watermark AND !fromMe AND type === 'chat'`
4. For each missed message: `classify()` → if `new_demand`, check `findDemandByMessage()` (dedup), then `saveDemand()` directly (no confirmation prompt in catch-up mode)
5. `setLastActive()` → update watermark to now
6. If any demands saved, send Bianca: `"🔄 Sincronizei N demanda(s) registrada(s) enquanto estava offline."`

### Supabase table (run once)

```sql
CREATE TABLE bot_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO bot_state (key, value) VALUES ('last_active_at', now()::text);
```

### Known edge case — message received during sync

**Scenario:** Bianca sends a message while `syncMissedDemands` is still running (the `ready` event and `message` event are independent and run concurrently).

**What happens:**
- The live `message` handler fires normally and stages the demand for confirmation
- Sync also sees the message (its timestamp > watermark) and may classify and save it directly — bypassing the confirmation flow
- The dedup guard (`findDemandByMessage`) reduces the risk of a duplicate, but since both paths run concurrently there is a small race window where both could read "no duplicate" before either writes

**Observable symptoms if it triggers:**
- Bianca sees a confirmation prompt for a demand that is already in the DB
- If she confirms, a second identical demand is saved
- Or sync saves it silently and the confirmation prompt is for nothing

**Why it's acceptable for now:** The window is only as long as sync takes (a few seconds), and it requires Bianca to send a message in that exact gap right after the bot reconnects. Adding a mutex would complicate the code significantly for a very low-probability event.

**If a duplicate is found:** check Supabase for two rows with the same `message` text and close timestamps — delete the extra one manually.

---

## 16. Message Traceability — Linking Demands to Original WhatsApp Messages

### Overview

Every demand stores the `whatsapp_message_id` (`msg.id._serialized`) of the WhatsApp message that originated it. This enables two things:

1. **Original message context in queries** — when Bianca asks about a specific demand by index, the original message text is injected into the system prompt so the bot can cite exactly what was said.
2. **Quoted reply** — the bot's response is sent as a WhatsApp quoted reply pointing back to the original message bubble, making it easy to scroll back and find the full context.

### Supabase migration (run once)

```sql
ALTER TABLE demands ADD COLUMN whatsapp_message_id TEXT;
```

### How it works

| Step | Where | What happens |
|---|---|---|
| Demand staged | `src/whatsapp/client.ts` | `msg.id._serialized` is stored in the `save` PendingAction |
| Demand confirmed | `executePendingAction` | `whatsapp_message_id` written to DB via `saveDemand()` |
| Sync replay | `src/sync.ts` | `msg.id._serialized` also written for demands recovered on restart |
| Query by index | `src/whatsapp/client.ts` | Original message text injected into system prompt; `whatsapp_message_id` captured |
| Response sent | `src/whatsapp/client.ts` | If `quotedMessageId` captured, uses `client.sendMessage(..., { quotedMessageId })` instead of `msg.reply()` |

### Behaviour

- Only triggers for queries that reference a specific demand by number (e.g. "me fala mais sobre a demanda 3")
- If the original message is too old for WhatsApp to render a preview, the message still sends normally — no error
- Demands created before this feature was added have `whatsapp_message_id = NULL` and fall back to `msg.reply()` silently

---

## 17. Demand Notes — Append-Only Activity Log

### Overview

The RT can attach timestamped notes to any existing demand via WhatsApp. Notes accumulate as an append-only log and are displayed inline when the bot lists demands.

Example interaction:
> "adicionar nota na demanda 2: liguei para o fornecedor, aguardando retorno"

### Supabase migration (run once)

```sql
ALTER TABLE demands ADD COLUMN notes TEXT;
```

### How it works

| Step | Where | What happens |
|---|---|---|
| Message classified | `src/ai/classifier.ts` | Type `add_note`, fields: `demandIndex` (1-based), `note` (text) |
| Note staged | `src/whatsapp/client.ts` | `noteTimestamp()` prefixes the note; stored in `add_note` PendingAction |
| RT confirms | `executePendingAction` | `appendNote(id, existing, newNote)` concatenates with `\n` onto existing notes |
| Display | `src/format.ts` — `formatDemand()` | Notes shown indented on a second line: `📝 [29/04 14:32] texto` |

### Key functions

- **`noteTimestamp()`** — `src/format.ts` — returns `[DD/MM HH:MM]` prefix using current time. Exported and unit-tested.
- **`appendNote(id, existing, newNote)`** — `src/db/supabase.ts` — writes `existing + '\n' + newNote` (or just `newNote` if no existing notes) to Supabase.

### Behaviour

- Notes are never replaced — each new note is appended, preserving history
- The confirmation prompt shows the full formatted note before it's saved
- If the demand index doesn't exist, the bot responds naturally (LLM handles it via context)

---

## 18. Workflow Engine

### Overview

The workflow engine lets the RT trigger multi-step automated sequences via natural language. Workflows are stored in Supabase and fully manageable via WhatsApp — no code changes needed to create or edit them.

**Design goals:**
- AI-inferred triggers — no exact keywords, LLM matches intent against workflow descriptions
- Minimal friction — single confirmation per meaningful action, free-text answers for questions
- Natural language throughout — she describes what she needs, the bot figures out the rest
- Persistent state — workflow instances survive bot restarts

**Motivation:** The tester feedback is that the current experience is too rigid for real clinic work. She needs to trigger structured sequences (e.g. onboarding a new hire, patient discharge checklist), generate message drafts from templates, and schedule notifications — all without learning commands.

---

### Supabase Tables (run in this order — dependencies matter)

#### 1. `message_templates`
```sql
CREATE TABLE message_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
Reusable message blueprints with `{{variable}}` placeholders. Referenced by workflow steps or used standalone.

#### 2. `workflows`
```sql
CREATE TABLE workflows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```
`description` is fed to the LLM to match trigger messages. Written in plain language describing when the workflow should fire (e.g. "Quando um novo funcionário é contratado").

#### 3. `workflow_steps`
```sql
CREATE TABLE workflow_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_order    integer NOT NULL,
  step_type     text NOT NULL,
  content       text NOT NULL,
  variable_name text,
  template_id   uuid REFERENCES message_templates(id) ON DELETE SET NULL,
  UNIQUE (workflow_id, step_order)
);
CREATE INDEX ON workflow_steps (workflow_id, step_order);
```
`step_type` is open text — validated in the engine, not the DB, so new types can be added without migrations.

#### 4. `workflow_instances`
```sql
CREATE TABLE workflow_instances (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id         uuid NOT NULL REFERENCES workflows(id),
  sender              text NOT NULL,
  current_step_order  integer NOT NULL DEFAULT 1,
  variables           jsonb NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON workflow_instances (sender, status);
```
One active instance per sender at a time (enforced in application layer). `variables` accumulates values captured from trigger message and `ask_question` steps.

#### 5. `notifications`
```sql
CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient    text NOT NULL,
  content      text NOT NULL,
  scheduled_at timestamptz,
  cron_expr    text,
  status       text NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications (status, scheduled_at);
```
`scheduled_at` null = immediate. `cron_expr` non-null = recurring (node-cron syntax). Dispatcher runs every minute.

---

### Step Types

| Type | Behavior | Needs confirmation? |
|---|---|---|
| `send_message` | Interpolate template → send to RT automatically | No |
| `ask_question` | Ask RT a question, store answer as `variable_name` | No (free text answer) |
| `create_demand` | Interpolate → classify for category/priority → stage demand | Yes |
| `create_notification` | Interpolate → stage notification record | Yes |

New types are added by registering a handler in `src/workflows/engine.ts` — no DB or schema changes needed.

---

### Variable Interpolation

All `content` fields support `{{variable_name}}` placeholders:
- Variables are extracted from the trigger message by the LLM (e.g. "Frank foi contratado" → `{name: "Frank"}`)
- `ask_question` step answers are stored under the step's `variable_name`
- Variables accumulate across steps in the instance's `variables` JSONB column
- Interpolation happens immediately before each step executes
- Unknown placeholders are left as-is and never throw

```
content: "Registrar admissão de {{name}}, cargo: {{role}}"
variables: { name: "Frank", role: "Técnico de enfermagem" }
result:    "Registrar admissão de Frank, cargo: Técnico de enfermagem"
```

---

### New Modules

| Module | Purpose | Test file |
|---|---|---|
| `src/db/workflows.ts` | Supabase CRUD for all 5 new tables | `tests/workflows-db.test.ts` |
| `src/workflows/interpolate.ts` | Pure `{{variable}}` string utilities | `tests/interpolate.test.ts` |
| `src/workflows/engine.ts` | Step execution orchestrator — returns `StepResult`, never touches WhatsApp | `tests/engine.test.ts` |
| `src/workflows/manager.ts` | Natural-language workflow management (create/list/edit via WhatsApp) | `tests/manager.test.ts` |
| `src/workflows/notifications.ts` | Cron dispatcher for scheduled notifications | `tests/notifications.test.ts` |

---

### Changes to Existing Modules

| Module | Change |
|---|---|
| `src/ai/classifier.ts` | Add `trigger_workflow` and `manage_workflows` intent types; optional `activeWorkflows` param injected into prompt |
| `src/ai/context.ts` | Add `advance_workflow` and `create_notification` PendingAction types; add in-memory `activeWorkflowMap` (Supabase is source of truth, map is a fast lookup cache) |
| `src/whatsapp/client.ts` | New decision order in message handler; new `handleStepResult()` helper; extend `executePendingAction()`; rehydrate workflow state on `ready` |

**Message handler decision order (client.ts):**
1. `getActiveWorkflow(sender)` → if set, treat message as `ask_question` answer
2. `getPendingAction(sender)` → existing confirmation flow
3. Fetch `activeWorkflows` from DB
4. `classify(msg, activeWorkflows)`
5. `trigger_workflow` → `triggerWorkflow()` → `handleStepResult()`
6. `manage_workflows` → `handleWorkflowManagement()` → reply
7. Existing intents (new_demand, update, query, add_note, other) — unchanged

---

### Engine StepResult Type

`engine.ts` returns instructions to `client.ts` rather than calling WhatsApp directly (keeps it testable):

```typescript
type StepResult =
  | { action: 'send_message';         content: string }
  | { action: 'ask_question';         prompt: string; variableName: string }
  | { action: 'confirm_demand';       pendingAction: PendingAction; confirmPrompt: string }
  | { action: 'confirm_notification'; pendingAction: PendingAction; confirmPrompt: string }
  | { action: 'workflow_complete';    summary: string }
  | { action: 'workflow_cancelled' }
```

---

### Key Design Decisions

| Decision | Rationale |
|---|---|
| `step_type` is open text, not a DB enum | New step types (e.g. `send_email`) can be added by registering an engine handler — no DB migration needed |
| Engine returns `StepResult`, never calls WhatsApp | Keeps engine pure and unit-testable; `client.ts` is the only WhatsApp-touching layer |
| `ask_question` bypasses `PendingAction` | PendingAction is a yes/no gate; question answers are free text and must not be confused with confirmations |
| `create_demand` inside workflow reuses existing `PendingAction` | Zero changes to the confirmation UI; engine wraps the DB write in an `advance_workflow` PendingAction |
| In-memory `activeWorkflowMap` + Supabase source of truth | Fast per-message lookup without a DB query; rehydrated from Supabase on bot restart |
| `activeWorkflows` injected into `classify()`, not fetched inside it | Keeps classifier stateless and testable |

---

### Implementation Slices

#### Slice 1 — Foundation
- [ ] DB migrations (run all 5 tables in Supabase)
- [ ] `src/db/workflows.ts` — CRUD for all tables
- [ ] `tests/workflows-db.test.ts`
- [ ] `src/workflows/interpolate.ts` — `interpolate()`, `extractVariableNames()`, `missingVariables()`
- [ ] `tests/interpolate.test.ts`

No visible behavior change. Data layer and string utilities in place and tested.

#### Slice 2 — Trigger + Linear Execution ✅
- [x] Extend `src/ai/classifier.ts` — add `trigger_workflow`, `manage_workflows`; inject active workflows into prompt
- [x] Update `tests/classifier.test.ts`
- [x] Extend `src/ai/context.ts` — add `activeWorkflowMap`, new PendingAction types
- [x] Update `tests/context.test.ts`
- [x] `src/workflows/engine.ts` — `send_message` and `ask_question` step types; `instanceId` in results
- [x] `tests/engine.test.ts` (send_message + ask_question)
- [x] Extend `src/whatsapp/client.ts` — new handler order, `handleStepResult()`, lazy rehydration via `getActiveInstance`

She can now create a workflow in Supabase and trigger it via WhatsApp. Variable capture and multi-step conversation work.

#### Slice 3 — Demand and Notification Steps ✅
- [x] Add `create_demand` step type to engine — classifies content via LLM, returns `confirm_demand` with `workflow_save_demand` PendingAction
- [x] Add `create_notification` step type to engine — stages notification with sender as recipient, returns `confirm_notification`
- [x] Add `workflow_save_demand` PendingAction type to `src/ai/context.ts`
- [x] Wire `workflow_save_demand` in `executePendingAction` (saves demand → advances workflow)
- [x] Extend `tests/engine.test.ts` — `create_demand` and `create_notification` step handlers
- [x] Extend `tests/context.test.ts` — `workflow_save_demand` type

Full end-to-end workflows work (e.g. onboarding with demand creation and notifications).

#### Slice 4 — Workflow Management via WhatsApp ✅
- [x] `src/db/workflows.ts` — add `getAllWorkflows()` (includes inactive; used by manager)
- [x] `src/workflows/manager.ts` — LLM-parsed commands: list / create / edit / toggle; `formatWorkflowList()` exported for testability
- [x] `src/whatsapp/client.ts` — route `manage_workflows` classification to `handleManageWorkflows()`
- [x] `tests/manager.test.ts` — 22 tests covering all operations and fallback/error paths
- [x] `tests/workflows-db.test.ts` — 3 new tests for `getAllWorkflows()`

She no longer needs Supabase access to manage workflows.

#### Slice 5 — Notification Dispatcher ✅
- [x] `src/workflows/notifications.ts` — `sendPendingNotifications()` polls every minute for one-time notifications; `scheduleRecurringNotifications()` registers in-memory node-cron jobs for recurring ones; `startNotificationDispatcher()` wires both with an immediate first run; `_stopAllJobs()` + `getScheduledJobCount()` for testability
- [x] `src/whatsapp/client.ts` — call `startNotificationDispatcher(client)` in `ready` handler
- [x] `tests/notifications.test.ts` — 12 tests covering send, skip, error resilience, double-schedule guard, invalid cron, callback firing, job cleanup

Scheduled and recurring notifications fire automatically. Feature complete.

---

### Workflow Example — Novo Funcionário

```
Workflows table:
  name: "Novo funcionário"
  description: "Quando um novo colaborador é contratado ou admitido"

workflow_steps:
  1. send_message    "Iniciando cadastro de {{name}}. Vou registrar as etapas necessárias."
  2. ask_question    "Qual o cargo de {{name}}?" → variable_name: "role"
  3. create_demand   "Registrar admissão: {{name}}, cargo: {{role}}"
  4. send_message    "✅ Demanda criada. Não esqueça de solicitar os documentos de {{name}}."
```

```
RT:  "Frank foi contratado"
Bot: "Iniciando cadastro de Frank. Vou registrar as etapas necessárias."
Bot: "Qual o cargo de Frank?"
RT:  "Técnico de enfermagem"
Bot: "📝 Vou registrar esta demanda:
      🟡 Registrar admissão: Frank, cargo: Técnico de enfermagem
      Confirma? (sim/não)"
RT:  "sim"
Bot: "✅ Feito!"
Bot: "✅ Demanda criada. Não esqueça de solicitar os documentos de Frank."
```

---

*Living document — update as decisions are made.*
