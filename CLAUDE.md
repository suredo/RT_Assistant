# RT Assistant — Agent Development Guide

## Project Overview

WhatsApp AI assistant for the Head Nurse (RT) of a hemodialysis clinic. Receives text and voice messages, classifies demands, persists them to Supabase, and sends proactive briefings. See `RT_Assistant_Development.md` for full architecture, decisions, and weekly implementation guides.

---

## Development Workflow

Follow this sequence for every task — no exceptions:

1. **Understand** — read the relevant section of `RT_Assistant_Development.md` before touching code
2. **Write tests first** — create or update the test file in `tests/` before implementing
3. **Implement** — write the feature
4. **Run tests** — `npm test` must pass with zero failures
5. **Commit** — only after tests are green

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
| `src/ai/classifier.js` | `tests/classifier.test.js` |
| `src/db/supabase.js` | `tests/supabase.test.js` |
| `src/briefing.js` | `tests/briefing.test.js` |
| `src/audio/transcribe.js` | `tests/transcribe.test.js` |

### What to test
- All code paths in pure functions (happy path + error/edge cases)
- Fallback behavior when external services return unexpected output
- Field names and filter logic in database queries

### What to mock
- LLM API calls (`axios` calls in `src/ai/glm.js`) — use `jest.mock`
- Supabase client (`@supabase/supabase-js`) — mock the chained query builder
- WhatsApp client (`whatsapp-web.js`) — mock for unit tests; covered by manual smoke test for end-to-end
- Whisper API (`axios` call in `src/audio/transcribe.js`) — mock

### Follow existing patterns
See `RT_Assistant_Development.md` Section 14 for full test examples for each module.

### Keep functions testable
- Extract formatting/business logic into standalone exported functions before wiring them into callbacks or cron jobs
- Example: `formatBriefing(demands)` is exported from `briefing.js` so it can be tested without a cron or WhatsApp client

---

## Pre-commit Checklist

Before every commit, verify all of the following:

- [ ] `npm test` passes — zero failures, zero errors
- [ ] New module has a corresponding test file
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
git add src/ai/classifier.js tests/classifier.test.js

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
| `RT_NUMBER` | Authorized WhatsApp number (no + or spaces) |
| `NODE_ENV` | `development` or `production` |

---

## What Not to Do

- Do not commit `.env` or any file containing API keys
- Do not add features from a future week without explicit instruction
- Do not mock the WhatsApp session for manual testing — use the real bot on the secondary number
- Do not use `console.log` for structured data in production paths — use labeled log prefixes (`📩`, `🤖`, `⚠️`) as established in the codebase
- Do not send real patient names or dates of birth to GLM (servers in China, outside LGPD) — use anonymized test data during development
