/**
 * E2E smoke tests for workflow manager LLM prompts (MANAGER_PROMPT + MODIFY_PROMPT).
 * Validates that the real LLM produces structurally valid JSON responses and
 * that prompt engineering rules hold under actual model inference.
 *
 * Run with: npm run test:e2e
 */

import * as dotenv from 'dotenv';
dotenv.config();

// Swap Supabase for SQLite so no real DB is needed
jest.mock('../../../src/db/workflows', () => require('../helpers/testDb'));

import { setupTestDb, clearTestDb } from '../helpers/testDb';
import { handleManageWorkflows, modifyManageCommand } from '../../../src/workflows/manager';

if (!process.env.GLM_API_KEY && !process.env.CLAUDE_API_KEY) {
  console.warn('⚠️  Skipping manager e2e tests — no LLM API key found');
  test.skip('no API key', () => {});
} else {

beforeAll(() => setupTestDb());
beforeEach(() => clearTestDb());

// ── MANAGER_PROMPT — create workflow ──────────────────────────────────────────

describe('MANAGER_PROMPT — create workflow', () => {
  test('returns a valid preview with operation=create and at least one step', async () => {
    const result = await handleManageWorkflows(
      "crie um workflow chamado 'Contratação' para quando um colaborador é contratado, com 1 passo: perguntar o cargo",
    );
    expect(result.type).toBe('preview');
    if (result.type === 'preview') {
      expect(result.cmd.operation).toBe('create');
      expect(result.cmd.name).toBeTruthy();
      expect(result.cmd.steps).toBeDefined();
      expect(result.cmd.steps!.length).toBeGreaterThan(0);
      expect(result.preview).toContain('sim/não');
    }
  });

  test('returns immediate response for list command', async () => {
    const result = await handleManageWorkflows('lista os workflows cadastrados');
    expect(result.type).toBe('immediate');
  });

  test('creates ask_question and send_message steps when both are requested', async () => {
    const result = await handleManageWorkflows(
      "crie um workflow 'Onboarding' com 2 passos: perguntar o nome do colaborador, depois enviar mensagem de boas-vindas com o nome",
    );
    if (result.type === 'preview') {
      const types = result.cmd.steps!.map(s => s.step_type);
      expect(types).toContain('ask_question');
      expect(types).toContain('send_message');
    }
  });

  test('send_message step has both content (template name) and template_content (message text)', async () => {
    const result = await handleManageWorkflows(
      "crie um workflow 'Boas-vindas' com 1 passo: enviar mensagem 'Seja bem-vindo à equipe, {{nome}}!'",
    );
    if (result.type === 'preview') {
      const sendStep = result.cmd.steps!.find(s => s.step_type === 'send_message');
      if (sendStep) {
        // content = short template name, template_content = full message text
        expect(sendStep.content).toBeTruthy();
        expect(sendStep.template_content).toBeTruthy();
        expect(sendStep.template_content!.length).toBeGreaterThan(sendStep.content.length);
      }
    }
  });

  test('draft prefix is present when destination is a third party', async () => {
    const result = await handleManageWorkflows(
      "crie um workflow com 1 passo: enviar mensagem para o RH informando a nova contratação",
    );
    if (result.type === 'preview') {
      const sendStep = result.cmd.steps!.find(s => s.step_type === 'send_message');
      if (sendStep?.template_content) {
        // When the destination is a third party (HR), the bot should frame it as a draft
        expect(sendStep.template_content).toMatch(/rascunho|encaminhar|revisar/i);
      }
    }
  });
});

// ── MODIFY_PROMPT — in-preview modification ───────────────────────────────────

describe('MODIFY_PROMPT — in-preview modification', () => {
  const baseCmd = {
    operation: 'create' as const,
    name: 'Contratação',
    description: 'Quando um colaborador é contratado',
    steps: [
      {
        step_order: 1,
        step_type: 'ask_question',
        content: 'Qual o cargo, departamento e justificativa?',
        variable_name: 'info',
      },
      {
        step_order: 2,
        step_type: 'send_message',
        content: 'Contratação — rascunho RH',
        template_content: '📋 Rascunho para encaminhar ao RH — revise antes de enviar:\nNovo colaborador: {{info}}',
      },
    ],
  };

  test('removes a field from an ask_question when asked ("retire a justificativa")', async () => {
    const result = await modifyManageCommand('retire a justificativa da pergunta', baseCmd);
    expect(result.type).toBe('preview');
    if (result.type === 'preview') {
      // Same number of steps — only the question content changed
      expect(result.cmd.steps).toHaveLength(2);
      expect(result.cmd.steps![0].step_type).toBe('ask_question');
      expect(result.cmd.steps![0].content).not.toMatch(/justificativa/i);
      expect(result.cmd.steps![0].content).toMatch(/cargo|departamento/i);
    }
  });

  test('adds a new step at the end when asked', async () => {
    const result = await modifyManageCommand(
      'adiciona um último passo para criar uma demanda de onboarding',
      baseCmd,
    );
    expect(result.type).toBe('preview');
    if (result.type === 'preview') {
      expect(result.cmd.steps!.length).toBeGreaterThan(baseCmd.steps.length);
      const lastStep = result.cmd.steps![result.cmd.steps!.length - 1];
      expect(lastStep.step_type).toBe('create_demand');
    }
  });

  test('preserves operation=create regardless of modification', async () => {
    const result = await modifyManageCommand('muda o nome do workflow para Admissão', baseCmd);
    if (result.type === 'preview') {
      expect(result.cmd.operation).toBe('create');
    }
  });

  test('preserves unmodified steps when only one step is changed', async () => {
    const result = await modifyManageCommand('retire a justificativa', baseCmd);
    if (result.type === 'preview') {
      // Step 2 (send_message) must be present and unchanged in type
      const step2 = result.cmd.steps!.find(s => s.step_order === 2);
      expect(step2).toBeDefined();
      expect(step2?.step_type).toBe('send_message');
    }
  });

  test('renumbers step_order correctly after adding a step', async () => {
    const result = await modifyManageCommand(
      'adiciona um passo no início: perguntar o nome do colaborador',
      baseCmd,
    );
    if (result.type === 'preview') {
      const orders = result.cmd.steps!.map(s => s.step_order).sort((a, b) => a - b);
      // step_orders must be sequential starting at 1
      orders.forEach((order, i) => expect(order).toBe(i + 1));
    }
  });
});

} // end API key guard
