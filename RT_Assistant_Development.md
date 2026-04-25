# RT Assistant — Development Document

> AI Assistant for the Head Nurse (RT) of a Hemodialysis Clinic  
> Status: **Planning** | Last updated: April 2026

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
- [ ] Receive text and audio messages from the RT
- [ ] Automatically transcribe audio messages
- [ ] Classify each demand by category and urgency
- [ ] Log demands with timestamp and context
- [ ] Answer the RT's queries about open items
- [ ] Mark demands as resolved through conversation
- [ ] Generate a daily briefing at the start of each shift
- [ ] List what was left pending from the previous day

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
- [ ] Save important notes
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
│   │   └── client.js        # whatsapp-web.js connection
│   ├── ai/
│   │   ├── glm.js           # GLM Zhipu integration (development)
│   │   └── classifier.js    # demand classification logic
│   ├── audio/
│   │   └── transcribe.js    # Whisper transcription
│   ├── db/
│   │   └── supabase.js      # database access
│   └── index.js             # application entry point
├── .env                     # API keys — never commit
├── .env.example             # template without real values
├── .gitignore
└── package.json
```

### Initial setup

```bash
# 1. Create the project
mkdir rt-assistant && cd rt-assistant
git init
npm init -y

# 2. Core dependencies
npm install whatsapp-web.js qrcode-terminal
npm install @supabase/supabase-js
npm install express dotenv

# 3. Audio transcription
pip install openai-whisper
```

### Environment variables (.env)

```env
# LLM — Development
GLM_API_KEY=your_key_here
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4

# LLM — Production (swap in when moving to real data)
CLAUDE_API_KEY=your_key_here

# Audio transcription
OPENAI_API_KEY=your_key_here   # used only for Whisper API calls

# Database
SUPABASE_URL=your_url_here
SUPABASE_KEY=your_key_here

# WhatsApp — authorized number (country code + area code + number, no + or spaces)
RT_NUMBER=5563999999999

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

### Basic connection

```javascript
// src/ai/glm.js
const axios = require('axios');

const GLM_URL = process.env.GLM_BASE_URL + '/chat/completions';
const GLM_KEY = process.env.GLM_API_KEY;

async function chat(messages) {
  const response = await axios.post(GLM_URL, {
    model: 'glm-4',
    messages: messages,
    temperature: 0.3   // more deterministic for classification
  }, {
    headers: {
      'Authorization': `Bearer ${GLM_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data.choices[0].message.content;
}

module.exports = { chat };
```

### Base system prompt — Phase 1

```javascript
// Note: prompt kept in Portuguese as the AI interacts with Bianca in Portuguese
const SYSTEM_PROMPT = `
Você é um assistente da Enfermeira RT de uma clínica de hemodiálise.
Seu papel é ajudá-la a organizar demandas, registrar pendências e
responder consultas sobre o que está em aberto.

Ao receber uma mensagem, identifique se é:
- Nova demanda (algo que precisa ser feito)
- Atualização de demanda existente (algo foi resolvido ou mudou)
- Consulta (ela quer saber o que está pendente, urgente, etc.)

Responda sempre em português, de forma direta e concisa.
Use emojis para indicar prioridade: 🔴 urgente, 🟡 média, ⚪ rotina.
Nunca invente informações — se não souber, pergunte.
`;
```

### Demand classification

```javascript
// src/ai/classifier.js
const { chat } = require('./glm');

async function classify(message) {
  const prompt = [
    { role: 'system', content: `
      Classify the message below into:
      - category: "clinical_urgent" | "team_management" | "medical_team" | "administrative" | "regulatory" | "routine"
      - priority: "high" | "medium" | "low"
      - type: "new_demand" | "update" | "query"
      - summary: short phrase describing the demand

      Respond ONLY with valid JSON, no explanations.
    `},
    { role: 'user', content: message }
  ];

  const response = await chat(prompt);

  try {
    return JSON.parse(response);
  } catch {
    return { category: 'routine', priority: 'low', type: 'new_demand', summary: message };
  }
}

module.exports = { classify };
```

### Main flow — first functional test

```javascript
// src/index.js
require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { chat } = require('./ai/glm');
const { classify } = require('./ai/classifier');

const client = new Client({ authStrategy: new LocalAuth() });

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR Code with WhatsApp');
});

client.on('ready', () => console.log('✅ RT Assistant connected'));

client.on('message', async msg => {
  if (msg.fromMe) return;   // ignore messages sent by the assistant itself

  console.log(`📩 Message received: ${msg.body}`);

  const classification = await classify(msg.body);
  console.log('🏷️  Classification:', classification);

  const history = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: msg.body }
  ];

  const response = await chat(history);
  await msg.reply(response);
});

client.initialize();
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
| WhatsApp session lost on cloud restart | Medium | Use Railway with a persistent volume; document the QR re-scan recovery procedure |

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
| 5 | Set up server and WhatsApp integration | Tech | 🔲 Pending |
| 6 | Develop Phase 1 — MVP | Tech | 🔲 Pending |
| 7 | Test with Bianca for 2 weeks | Tech + Business | 🔲 Pending |
| 8 | Collect feedback and iterate | Tech | 🔲 Pending |

---

## 10. Week 1 — WhatsApp Connection + Basic GLM Response

**Goal:** Have the assistant connected to WhatsApp, receiving messages and responding via GLM. No database yet — full focus on validating the end-to-end flow.

---

### 10.1 Prerequisites

Before starting, make sure you have:

- [ ] Node.js installed (`node -v` in the terminal)
- [ ] Git installed (`git -v` in the terminal)
- [ ] GLM API key ready
- [ ] A **secondary WhatsApp number** available to act as the assistant (do not use your personal number)

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

Create the `.env` file at the project root:

```env
GLM_API_KEY=your_key_here
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
NODE_ENV=development
```

Create `.env.example` to document variables without exposing values:

```env
GLM_API_KEY=
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
CLAUDE_API_KEY=
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
RT_NUMBER=
NODE_ENV=development
```

---

### 10.4 GLM module

```javascript
// src/ai/glm.js
const axios = require('axios');
require('dotenv').config();

const GLM_URL = `${process.env.GLM_BASE_URL}/chat/completions`;
const GLM_KEY = process.env.GLM_API_KEY;

// Base system prompt — Bianca's context (kept in Portuguese for the AI to interact with her)
const SYSTEM_PROMPT = `Você é um assistente da Enfermeira RT de uma clínica de hemodiálise.
Seu papel é ajudá-la a organizar demandas, registrar pendências e responder consultas sobre o que está em aberto.

Ao receber uma mensagem, identifique se é:
- Nova demanda (algo que precisa ser feito)
- Atualização de demanda existente (algo foi resolvido ou mudou)
- Consulta (ela quer saber o que está pendente, urgente, etc.)

Responda sempre em português, de forma direta e concisa.
Use emojis para indicar prioridade: 🔴 urgente, 🟡 média, ⚪ rotina.
Nunca invente informações — se não souber, pergunte.`;

async function reply(userMessage, history = []) {
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userMessage }
    ];

    const response = await axios.post(GLM_URL, {
      model: 'glm-4',
      messages: messages,
      temperature: 0.3
    }, {
      headers: {
        'Authorization': `Bearer ${GLM_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;

  } catch (error) {
    console.error('GLM error:', error.response?.data || error.message);
    return '⚠️ Error processing your message. Please try again.';
  }
}

module.exports = { reply, SYSTEM_PROMPT };
```

---

### 10.5 WhatsApp client

```javascript
// src/whatsapp/client.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { reply } = require('../ai/glm');

// Authorized number to use the assistant
// Format: country code + area code + number, no + or spaces
// Example: 5563999999999
const AUTHORIZED_NUMBER = process.env.RT_NUMBER;

function start() {
  const client = new Client({
    authStrategy: new LocalAuth(),   // saves session locally — no QR scan needed on restart
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  // Show QR Code in terminal on first run
  client.on('qr', qr => {
    console.log('\n📱 Scan the QR Code below with the assistant WhatsApp number:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('✅ RT Assistant connected and ready');
  });

  client.on('auth_failure', () => {
    console.error('❌ Authentication failed — delete .wwebjs_auth folder and try again');
  });

  client.on('disconnected', reason => {
    console.warn('⚠️ Disconnected:', reason);
    // Attempt reconnection after 5 seconds
    setTimeout(() => client.initialize(), 5000);
  });

  client.on('message', async msg => {
    // Ignore group messages in Phase 1
    if (msg.from.includes('@g.us')) return;

    // Ignore messages sent by the assistant itself
    if (msg.fromMe) return;

    // Restrict to authorized number (optional during pilot)
    // if (AUTHORIZED_NUMBER && !msg.from.includes(AUTHORIZED_NUMBER)) return;

    console.log(`\n📩 [${new Date().toLocaleTimeString()}] Message from ${msg.from}: ${msg.body}`);

    // Show typing indicator
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    // Process with GLM
    const response = await reply(msg.body);

    console.log(`🤖 Response: ${response}\n`);

    await msg.reply(response);
  });

  client.initialize();
  return client;
}

module.exports = { start };
```

---

### 10.6 Application entry point

```javascript
// src/index.js
require('dotenv').config();
const { start } = require('./whatsapp/client');

console.log('🚀 Starting RT Assistant...');
start();
```

Add start scripts to `package.json`:

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  }
}
```

---

### 10.7 Running for the first time

```bash
# Start the assistant
npm start

# The terminal will display a QR Code
# Open WhatsApp on the secondary (assistant) number
# Go to: Linked Devices > Link a Device
# Scan the QR Code

# After connecting, you will see:
# ✅ RT Assistant connected and ready
```

From that point, any message sent to the secondary number will be processed by GLM and receive a response.

---

### 10.8 Testing the flow

Send test messages from your personal number to the assistant number:

| Test message | What to validate |
|---|---|
| `"hi"` | Assistant responds in a contextualized way |
| `"what is pending?"` | Responds that there are no records yet (Week 2 adds database) |
| `"patient in chair 3 with low blood pressure"` | Identified as clinical urgent |
| `"I need to cover the morning shift tomorrow"` | Identified as team management |
| `"what is the ANVISA report deadline?"` | Responds that it doesn't have that info yet (Week 3) |

---

### 10.9 Common issues

| Issue | Likely cause | Solution |
|---|---|---|
| QR Code doesn't appear | Puppeteer not installed correctly | `npm install puppeteer` |
| Disconnects on its own | Session expired | Delete `.wwebjs_auth/` and scan again |
| GLM 401 error | Invalid API key | Check `.env` |
| Message sent but no response | Silent GLM error | Check terminal logs |
| `Cannot find module` | Missing dependency | `npm install` |

---

### 10.10 Week 1 completion checklist

Week 1 is complete when:

- [ ] Project created and versioned in Git
- [ ] Assistant connects to WhatsApp without errors
- [ ] Session persists after restart (`npm start` doesn't ask for QR Code again)
- [ ] Text messages are received and answered by GLM
- [ ] Logs appear correctly in the terminal
- [ ] Auto-reconnect works after a drop

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

- [ ] Demands saved to Supabase after every new demand message
- [ ] "What is pending?" returns open demands from the database
- [ ] "What is urgent?" returns only high-priority open items
- [ ] Conversation buffer keeps context across a multi-message exchange
- [ ] No data lost if the bot restarts (database is the source of truth)

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

- [ ] Morning briefing sent automatically at shift start
- [ ] "Summarize my day" returns a formatted shift summary
- [ ] "What was left from yesterday?" correctly queries the previous day
- [ ] Briefing includes correct count of high-priority vs. other open items
- [ ] No duplicate briefings if the server restarts mid-morning

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
npm install --save-dev jest
```

`package.json`:
```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

**Test folder structure:**
```
rt-assistant/
├── src/
│   ├── ai/
│   │   ├── classifier.js
│   │   ├── context.js
│   │   └── glm.js
│   ├── audio/transcribe.js
│   ├── db/supabase.js
│   ├── briefing.js
│   └── index.js
└── tests/
    ├── classifier.test.js
    ├── context.test.js
    ├── supabase.test.js
    └── briefing.test.js
```

---

### 14.2 Classifier — JSON parsing (highest risk)

The classifier calls the LLM and parses its JSON response. The fallback when the LLM returns malformed JSON is critical — a broken classifier silently loses demand data.

```javascript
// tests/classifier.test.js
const { classify } = require('../src/ai/classifier');
const { chat } = require('../src/ai/glm');

jest.mock('../src/ai/glm');  // mock the LLM call

describe('classify()', () => {
  test('parses valid JSON from LLM', async () => {
    chat.mockResolvedValue(JSON.stringify({
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
    chat.mockResolvedValue('Sorry, I could not classify this.');  // not JSON

    const result = await classify('some message');

    expect(result.category).toBe('routine');
    expect(result.priority).toBe('low');
    expect(result.type).toBe('new_demand');
  });

  test('falls back gracefully when LLM returns empty response', async () => {
    chat.mockResolvedValue('');

    const result = await classify('some message');

    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('priority');
  });

  test('falls back gracefully when LLM call throws', async () => {
    chat.mockRejectedValue(new Error('API timeout'));

    await expect(classify('some message')).resolves.toHaveProperty('category');
  });
});
```

> ⚠️ This test suite revealed a gap: the original `classifier.js` (Section 5.1) does not catch LLM exceptions — only JSON parse failures. Update `classifier.js` to wrap the entire function in try/catch.

---

### 14.3 Context buffer — conversation history

```javascript
// tests/context.test.js
const { getHistory, addTurn } = require('../src/ai/context');

describe('conversation buffer', () => {
  const sender = '5563999999999';

  beforeEach(() => {
    // Clear module state between tests
    jest.resetModules();
  });

  test('returns empty array for a new sender', () => {
    const { getHistory } = require('../src/ai/context');
    expect(getHistory('unknown')).toEqual([]);
  });

  test('stores and retrieves turns correctly', () => {
    const { getHistory, addTurn } = require('../src/ai/context');
    addTurn(sender, 'user', 'hello');
    addTurn(sender, 'assistant', 'hi there');

    const history = getHistory(sender);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', content: 'hello' });
    expect(history[1]).toEqual({ role: 'assistant', content: 'hi there' });
  });

  test('trims buffer to last 10 exchanges (20 turns)', () => {
    const { getHistory, addTurn } = require('../src/ai/context');
    for (let i = 0; i < 15; i++) {
      addTurn(sender, 'user', `message ${i}`);
      addTurn(sender, 'assistant', `response ${i}`);
    }

    const history = getHistory(sender);
    expect(history.length).toBe(20);  // trimmed to 10 pairs
    // oldest messages dropped
    expect(history[0].content).toBe('message 5');
  });

  test('different senders have independent buffers', () => {
    const { getHistory, addTurn } = require('../src/ai/context');
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

```javascript
// tests/supabase.test.js

// Mock the Supabase client before requiring the module
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

const { saveDemand, resolveDemand, getOpenDemands } = require('../src/db/supabase');

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

```javascript
// tests/briefing.test.js

// Extract the formatting logic to a pure function in briefing.js:
// export function formatBriefing(demands) { ... }
const { formatBriefing } = require('../src/briefing');

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

The `briefing.js` in Section 12.1 has the formatting logic inlined inside the cron callback. Separate it:

```javascript
// src/briefing.js — updated
function formatBriefing(demands) {
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

function startBriefingSchedule(client) {
  cron.schedule('30 6 * * 1-5', async () => {
    const demands = await getOpenDemands({ days: 1 });
    const text = formatBriefing(demands);
    await client.sendMessage(`${process.env.RT_NUMBER}@c.us`, text);
  });
}

module.exports = { startBriefingSchedule, formatBriefing };
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

*Living document — update as decisions are made.*
