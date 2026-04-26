# RT Assistant — Agent Development Guide

## Project Overview

WhatsApp AI assistant for the Head Nurse (RT) of a hemodialysis clinic. Receives text and voice messages, classifies demands, persists them to Supabase, and sends proactive briefings. See `RT_Assistant_Development.md` for full architecture, decisions, and weekly implementation guides.

**Stack:** Node.js + TypeScript, whatsapp-web.js, GLM-4.7 (dev) / Claude (prod), Supabase, Jest + ts-jest.

---

## Development Workflow

Follow this sequence for every task — no exceptions:

1. **Understand** — read the relevant section of `RT_Assistant_Development.md` before touching code
2. **Write tests first** — create or update the test file in `tests/` before implementing
3. **Implement** — write the feature
4. **Run tests** — `npm test` must pass with zero failures
5. **Update docs** — see Documentation Rules below
6. **Commit** — only after tests are green and docs are updated

---

## Testing Requirements

### Run tests
```bash
npm test          # run all tests once
npm run test:watch  # watch mode during development
```

### Every new module needs a test file
| New file | Test file |
|---|---|
| `src/ai/glm.ts` | `tests/glm.test.ts` |
| `src/whatsapp/auth.ts` | `tests/auth.test.ts` |
| `src/ai/classifier.ts` | `tests/classifier.test.ts` |
| `src/ai/context.ts` | `tests/context.test.ts` |
| `src/db/supabase.ts` | `tests/supabase.test.ts` |
| `src/briefing.ts` | `tests/briefing.test.ts` |
| `src/audio/transcribe.ts` | `tests/transcribe.test.ts` |

### What to test
- All code paths in pure functions (happy path + error/edge cases)
- Fallback behavior when external services return unexpected output
- Field names and filter logic in database queries

### What to mock
- LLM API calls (`axios` calls in `src/ai/glm.ts`) — use `jest.mock('axios')`; get typed mock via `jest.mocked(axios.post)`
- Supabase client (`@supabase/supabase-js`) — mock the chained query builder
- WhatsApp client (`whatsapp-web.js`) — mock for unit tests; covered by manual smoke test for end-to-end
- Whisper API (`axios` call in `src/audio/transcribe.ts`) — mock

### Follow existing patterns
See `RT_Assistant_Development.md` Section 14 for full test examples for each module.

### Keep functions testable
- Extract formatting/business logic into standalone exported functions before wiring them into callbacks or cron jobs
- Example: `formatBriefing(demands)` is exported from `briefing.ts` so it can be tested without a cron or WhatsApp client

---

## Documentation Rules

After every feature implementation, update `RT_Assistant_Development.md` before committing:

| Event | What to update |
|---|---|
| Feature from Phase 1 list completed | Check `- [ ]` → `- [x]` in Section 3 |
| Week N checklist item completed | Check `- [ ]` → `- [x]` in Section 10.10 / 11.4 / 12.3 / 13.4 |
| Entire week completed | Update status header (`> Status:`) and Next Steps table (Section 9) |
| New env var added | Add row to env table in Section 5 and update `.env.example` |
| New module added | Add row to module→test table in `CLAUDE.md` and update Section 14 test examples |
| Architecture or decision changed | Update the relevant section so the doc matches the code |

**The docs are the source of truth for any new AI context window.** If the code diverges from the docs, future sessions will implement things incorrectly. Keep them in sync.

---

## Pre-commit Checklist

Before every commit, verify all of the following:

- [ ] `npm test` passes — zero failures, zero errors
- [ ] New module has a corresponding test file
- [ ] `RT_Assistant_Development.md` checkboxes and status updated (see Documentation Rules)
- [ ] No API keys, secrets, or real patient data in any file
- [ ] `.env` is not staged (`git status` should never show `.env`)
- [ ] Only specific files staged — never `git add .` or `git add -A` blindly

---

## Commit Process

```bash
# 1. Check what changed
git status
git diff

# 2. Stage specific files only
git add src/ai/classifier.ts tests/classifier.test.ts

# 3. Commit with a clear message
git commit -m "add demand classifier with JSON fallback"
```

**Never commit if `npm test` fails.** Fix the tests first.

---

## Code Conventions

- **User-facing messages:** Portuguese — Bianca communicates in Portuguese
- **Code, variables, comments:** English
- **Comments:** only when the WHY is non-obvious — never explain what the code does
- **Error handling:** wrap external API calls (GLM, Whisper, Supabase) in try/catch and return a safe fallback — never let an unhandled exception crash the process
- **No features beyond the current week's scope** — refer to `RT_Assistant_Development.md` for what belongs in each week

---

## Environment Variables

Never hardcode keys. All secrets live in `.env` (never committed). Template is in `.env.example`.

| Variable | Purpose |
|---|---|
| `GLM_API_KEY` | LLM — development |
| `GLM_BASE_URL` | GLM endpoint |
| `CLAUDE_API_KEY` | LLM — production |
| `OPENAI_API_KEY` | Whisper API transcription |
| `SUPABASE_URL` | Database |
| `SUPABASE_KEY` | Database |
| `RT_NUMBER` | RT's phone number — used for proactive messaging and authorization |
| `RT_LID` | RT's WhatsApp Linked Device ID — set this if `RT_NUMBER` authorization fails (copy value from warning log) |
| `TEAM_NUMBERS` | Comma-separated team phone numbers — restricted access (add demands only) |
| `TEAM_LIDS` | Comma-separated team LIDs — fallback if team members trigger authorization failures |
| `PAIRING_NUMBER` | Assistant's number — set to link via pairing code instead of QR scan |
| `NODE_ENV` | `development` or `production` |

---

## What Not to Do

- Do not commit `.env` or any file containing API keys
- Do not add features from a future week without explicit instruction
- Do not mock the WhatsApp session for manual testing — use the real bot on the secondary number
- Do not use `console.log` for structured data in production paths — use labeled log prefixes (`📩`, `🤖`, `⚠️`) as established in the codebase
- Do not send real patient names or dates of birth to GLM (servers in China, outside LGPD) — use anonymized test data during development
