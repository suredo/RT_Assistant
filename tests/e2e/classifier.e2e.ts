/**
 * E2E tests for the LLM classifier — uses the real GLM API.
 * These catch prompt engineering bugs that unit tests with mocked LLM miss.
 *
 * Run with: npm run test:e2e
 */

import * as dotenv from 'dotenv';
dotenv.config();

if (!process.env.GLM_API_KEY && !process.env.CLAUDE_API_KEY) {
  console.warn('⚠️  Skipping classifier e2e tests — no LLM API key found');
  test.skip('no API key', () => {});
} else {

const { classify } = require('../../src/ai/classifier');

describe('classifier — manage_workflows routing', () => {
  test('create workflow message routes to manage_workflows even when steps mention "criar uma demanda"', async () => {
    const result = await classify(
      "crie um workflow chamado 'Abrir vaga' ativado quando querem abrir uma vaga, com 1 passo do tipo create_demand com conteúdo 'Abertura de vaga para {{role}}'"
    );
    expect(result.type).toBe('manage_workflows');
  });

  test('simple create workflow routes to manage_workflows', async () => {
    const result = await classify("crie um workflow chamado 'Onboarding' com 2 passos");
    expect(result.type).toBe('manage_workflows');
  });

  test('list workflows routes to manage_workflows', async () => {
    const result = await classify('lista os workflows ativos');
    expect(result.type).toBe('manage_workflows');
  });

  test('toggle workflow routes to manage_workflows', async () => {
    const result = await classify("desativa o workflow 'Onboarding'");
    expect(result.type).toBe('manage_workflows');
  });
});

describe('classifier — demand routing', () => {
  test('clinical urgency routes to new_demand', async () => {
    const result = await classify('paciente apresentou hipotensão durante a sessão, precisamos de avaliação médica urgente');
    expect(result.type).toBe('new_demand');
    expect(result.priority).toBe('high');
  });

  test('routine demand routes to new_demand with low priority', async () => {
    const result = await classify('precisamos repor os descartáveis do estoque');
    expect(result.type).toBe('new_demand');
  });

  test('query about open demands routes to query', async () => {
    const result = await classify('quais são as demandas abertas?');
    expect(result.type).toBe('query');
    expect(result.queryFilters?.status).toBe('open');
  });
});

describe('classifier — trigger_workflow routing', () => {
  test('matches hiring trigger and extracts variable', async () => {
    const workflows = [{
      id: 'wf-hiring',
      name: 'Contratação',
      description: 'Ativado quando um novo colaborador é contratado',
    }];
    const result = await classify('Frank foi contratado como técnico de enfermagem', workflows);
    expect(result.type).toBe('trigger_workflow');
    expect(result.workflowId).toBe('wf-hiring');
    expect(result.workflowVariables?.name?.toLowerCase()).toContain('frank');
  });
});

} // end API key guard
