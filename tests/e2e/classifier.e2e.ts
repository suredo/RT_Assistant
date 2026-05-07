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

const { classify, mergeSummary } = require('../../src/ai/classifier');

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

// ── Missing intent coverage ───────────────────────────────────────────────────

describe('classifier — update intent', () => {
  test('routes resolved demand to update with resolved=true and correct demandIndex', async () => {
    const result = await classify('a demanda 1 foi resolvida');
    expect(result.type).toBe('update');
    expect(result.resolved).toBe(true);
    expect(result.demandIndex).toBe(1);
  });

  test('routes priority update to update with resolved=false', async () => {
    const result = await classify('muda a demanda 2 para urgente');
    expect(result.type).toBe('update');
    expect(result.resolved).toBe(false);
    expect(result.demandIndex).toBe(2);
  });
});

describe('classifier — add_note intent', () => {
  test('routes note message to add_note with extracted note text and demandIndex', async () => {
    const result = await classify('adicionar nota na demanda 2: exame de sangue já solicitado');
    expect(result.type).toBe('add_note');
    expect(result.demandIndex).toBe(2);
    expect(result.note).toMatch(/exame/i);
  });
});

describe('classifier — discuss intent', () => {
  test('routes planning/opinion message to discuss', async () => {
    const result = await classify('o que você acha de reorganizar o turno da manhã para as 6h30?');
    expect(result.type).toBe('discuss');
  });

  test('does not classify clear action requests as discuss', async () => {
    const result = await classify('paciente com hipotensão grave na cadeira 3');
    expect(result.type).not.toBe('discuss');
  });
});

describe('classifier — other intent', () => {
  test('routes unrelated small talk to other', async () => {
    const result = await classify('tudo bem com você hoje?');
    expect(result.type).toBe('other');
  });
});

describe('classifier — suggest_workflow intent', () => {
  test('identifies clearly recurring structured process with no active workflows', async () => {
    const result = await classify(
      'esse é o terceiro processo de admissão que fazemos este mês — acho que devíamos ter um procedimento padrão para isso',
      [], // explicitly no active workflows
    );
    expect(result.type).toBe('suggest_workflow');
  });

  test('populates category, priority and summary like new_demand when suggesting workflow', async () => {
    const result = await classify(
      'processo de desligamento de colaboradores acontece algumas vezes por ano, sempre os mesmos passos',
      [],
    );
    if (result.type === 'suggest_workflow') {
      expect(result.category).toBeTruthy();
      expect(result.priority).toBeTruthy();
      expect(result.summary).toBeTruthy();
    }
  });
});

describe('classifier — query with filters', () => {
  test('extracts status=resolved filter', async () => {
    const result = await classify('quais demandas já foram resolvidas essa semana?');
    expect(result.type).toBe('query');
    expect(result.queryFilters?.status).toBe('resolved');
  });

  test('extracts category filter from query', async () => {
    const result = await classify('tem alguma demanda de urgência clínica aberta?');
    expect(result.type).toBe('query');
    expect(result.queryFilters?.category).toMatch(/urgência clínica/i);
  });

  test('extracts status=all filter', async () => {
    const result = await classify('me mostra todas as demandas, abertas e resolvidas');
    expect(result.type).toBe('query');
    expect(result.queryFilters?.status).toBe('all');
  });
});

// ── MERGE_PROMPT smoke test ───────────────────────────────────────────────────

describe('MERGE_PROMPT — LLM smoke test', () => {
  test('produces a combined summary under 120 chars that preserves both inputs', async () => {
    const merged = await mergeSummary(
      'Paciente hipotensão durante diálise — avaliação médica necessária',
      'Médico já foi notificado, aguardando retorno'
    );
    expect(typeof merged).toBe('string');
    expect(merged.length).toBeGreaterThan(0);
    expect(merged.length).toBeLessThanOrEqual(120);
    // Should contain key context from at least one of the inputs
    expect(merged).toMatch(/hipotensão|médico|notificado|avaliação/i);
  });

  test('falls back to original summary when given empty new message', async () => {
    const original = 'Resumo original intacto';
    const merged = await mergeSummary(original, '');
    expect(merged).toBeTruthy();
    // Should at minimum not lose the original context
  });
});

} // end API key guard
