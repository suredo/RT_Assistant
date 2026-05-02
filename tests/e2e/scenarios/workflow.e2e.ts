/**
 * E2E scenario: full workflow lifecycle
 *   1. Create a workflow via natural language → verify in SQLite
 *   2. Trigger the workflow → walk steps → verify instance state in SQLite
 *   3. Create a demand through the workflow → confirm → verify demand in SQLite
 *
 * Uses: real LLM + SQLite (via testDb) + ConversationSimulator
 * Run with: npm run test:e2e
 */

import * as dotenv from 'dotenv';
dotenv.config();

// ── DB modules replaced with SQLite before any src imports ────────────────────
jest.mock('../../../src/db/workflows', () => require('../helpers/testDb'));
jest.mock('../../../src/db/supabase',  () => require('../helpers/testDb'));

import { setupTestDb, clearTestDb, getTestDb } from '../helpers/testDb';
import { ConversationSimulator } from '../helpers/conversation';

if (!process.env.GLM_API_KEY && !process.env.CLAUDE_API_KEY) {
  console.warn('⚠️  Skipping workflow e2e tests — no LLM API key found');
  test.skip('no API key', () => {});
} else {

const sim = new ConversationSimulator('5511999999999', 'rt');

beforeAll(() => setupTestDb());
beforeEach(() => {
  clearTestDb();
  sim.reset();
});

// ── Scenario 1: Create workflow via WhatsApp ──────────────────────────────────

describe('workflow creation', () => {
  test('creates workflow and step in SQLite when asked via natural language', async () => {
    const responses = await sim.send(
      "crie um workflow chamado 'Abrir vaga' ativado quando querem abrir uma vaga, com 1 passo do tipo create_demand com conteúdo 'Abertura de vaga para {{role}}'"
    );

    // Bot confirms creation
    expect(responses[0]).toMatch(/workflow.*abrir vaga.*criado/i);

    // Workflow persisted to SQLite
    const db = getTestDb();
    const wf = db.prepare(`SELECT * FROM workflows WHERE name = 'Abrir vaga'`).get() as Record<string, unknown>;
    expect(wf).toBeTruthy();
    expect(wf.is_active).toBeTruthy();

    // Step persisted
    const step = db.prepare(`SELECT * FROM workflow_steps WHERE workflow_id = ?`).get(wf.id) as Record<string, unknown>;
    expect(step).toBeTruthy();
    expect(step.step_type).toBe('create_demand');
    expect(step.content).toContain('{{role}}');
  });

  test('lists existing workflows', async () => {
    // Pre-seed a workflow
    const db = getTestDb();
    const id = 'wf-test-001';
    db.prepare(`INSERT INTO workflows (id, name, description, is_active, created_at) VALUES (?, ?, ?, 1, ?)`)
      .run(id, 'Onboarding', 'Quando um colaborador é contratado', new Date().toISOString());

    const responses = await sim.send('lista os workflows');
    expect(responses[0]).toMatch(/onboarding/i);
  });
});

// ── Scenario 2: Trigger workflow and walk send_message steps ─────────────────

describe('workflow trigger and execution', () => {
  test('triggers matching workflow and sends first message step', async () => {
    // Pre-seed a simple send_message workflow
    const db = getTestDb();
    const wfId = 'wf-send-001';
    db.prepare(`INSERT INTO workflows (id, name, description, is_active, created_at) VALUES (?, ?, ?, 1, ?)`)
      .run(wfId, 'Boas-vindas', 'Quando a Bianca quer dar boas-vindas a alguém', new Date().toISOString());
    db.prepare(`INSERT INTO workflow_steps (id, workflow_id, step_order, step_type, content) VALUES (?, ?, 1, 'send_message', ?)`)
      .run('step-001', wfId, 'Olá! Seja bem-vindo à equipe.');

    const responses = await sim.send('quero dar boas-vindas para o novo funcionário');

    // Engine auto-advances send_message and returns workflow_complete
    expect(responses.some(r => r.includes('Seja bem-vindo'))).toBe(true);
  });

  test('ask_question step captures answer and advances instance', async () => {
    const db = getTestDb();
    const wfId = 'wf-ask-001';
    db.prepare(`INSERT INTO workflows (id, name, description, is_active, created_at) VALUES (?, ?, ?, 1, ?)`)
      .run(wfId, 'Coleta de nome', 'Quando precisa coletar o nome de alguém', new Date().toISOString());
    db.prepare(`INSERT INTO workflow_steps (id, workflow_id, step_order, step_type, content, variable_name) VALUES (?, ?, 1, 'ask_question', 'Qual é o nome da pessoa?', 'name')`)
      .run('step-002', wfId);
    db.prepare(`INSERT INTO workflow_steps (id, workflow_id, step_order, step_type, content) VALUES (?, ?, 2, 'send_message', 'Nome registrado: {{name}}.')`)
      .run('step-003', wfId);

    // Trigger
    const r1 = await sim.send('preciso coletar um nome');
    expect(r1[0]).toContain('Qual é o nome');

    // Answer the question
    const r2 = await sim.send('Maria Silva');
    expect(r2.some(r => r.includes('Maria Silva'))).toBe(true);

    // Instance should be completed
    const instance = db.prepare(`SELECT * FROM workflow_instances WHERE workflow_id = ? AND sender = ?`)
      .get(wfId, '5511999999999') as Record<string, unknown> | undefined;
    expect(instance?.status).toBe('completed');
  });
});

// ── Scenario 3: Full demand creation through workflow ─────────────────────────

describe('workflow create_demand step', () => {
  test('stages demand for confirmation and saves to SQLite on confirm', async () => {
    const db = getTestDb();
    const wfId = 'wf-demand-001';
    db.prepare(`INSERT INTO workflows (id, name, description, is_active, created_at) VALUES (?, ?, ?, 1, ?)`)
      .run(wfId, 'Abrir vaga', 'Quando querem abrir uma vaga ou contratar alguém', new Date().toISOString());
    db.prepare(`INSERT INTO workflow_steps (id, workflow_id, step_order, step_type, content) VALUES (?, ?, 1, 'create_demand', 'Abertura de vaga para {{role}}')`)
      .run('step-004', wfId);

    // Trigger workflow
    const r1 = await sim.send('preciso contratar um técnico de enfermagem');
    expect(r1[0]).toMatch(/confirma/i);

    // Confirm
    const r2 = await sim.send('sim');

    // Demand saved to SQLite
    const demand = db.prepare(`SELECT * FROM demands LIMIT 1`).get() as Record<string, unknown> | undefined;
    expect(demand).toBeTruthy();
    expect((demand?.summary as string)?.toLowerCase()).toMatch(/vaga|técnico/i);
  });
});

} // end API key guard
