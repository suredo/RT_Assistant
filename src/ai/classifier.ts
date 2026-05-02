import { chat } from './glm';

export interface QueryFilters {
  status: 'open' | 'resolved' | 'all';
  category: string | null;
  priority: 'high' | 'medium' | 'low' | null;
}

export interface Classification {
  type: 'new_demand' | 'update' | 'query' | 'add_note' | 'trigger_workflow' | 'manage_workflows' | 'other';
  category: 'urgência clínica' | 'gestão de equipe' | 'equipe médica' | 'administrativo' | 'regulatório' | 'rotina';
  priority: 'high' | 'medium' | 'low';
  summary: string;
  demandIndex: number | null;
  resolved: boolean;
  queryFilters: QueryFilters | null;
  note: string | null;
  workflowId: string | null;
  workflowVariables: Record<string, string> | null;
}

const FALLBACK: Classification = {
  type: 'new_demand',
  category: 'rotina',
  priority: 'low',
  summary: 'Demanda não classificada',
  demandIndex: null,
  resolved: false,
  queryFilters: null,
  note: null,
  workflowId: null,
  workflowVariables: null
};

const BASE_CLASSIFY_PROMPT = `Você é um classificador de demandas de uma clínica de hemodiálise.
Analise a mensagem e retorne SOMENTE um JSON válido com os campos:
- type: "new_demand" | "update" | "query" | "add_note" | "trigger_workflow" | "manage_workflows" | "other"
- category: "urgência clínica" | "gestão de equipe" | "equipe médica" | "administrativo" | "regulatório" | "rotina"
- priority: "high" | "medium" | "low"
- summary: resumo curto da demanda em português (máximo 80 caracteres)
- demandIndex: número inteiro da demanda referenciada (ex: se a mensagem menciona "demanda 2" retorne 2), ou null se não há referência
- resolved: true se a mensagem indica que a demanda foi resolvida/concluída/fechada, false caso contrário
- queryFilters: quando type é "query", um objeto com:
  - status: "open" (abertas) | "resolved" (resolvidas) | "all" (todas) — padrão "open" se não especificado
  - category: categoria filtrada ("urgência clínica" etc.) ou null se não especificada
  - priority: "high" | "medium" | "low" ou null se não especificada
  Quando type não é "query", retorne queryFilters como null.
- note: quando type é "add_note", o texto da nota a ser registrada (extraído literalmente da mensagem após os dois-pontos ou equivalente); null para outros tipos.
- workflowId: quando type é "trigger_workflow", o id do workflow correspondente; null para outros tipos.
- workflowVariables: quando type é "trigger_workflow", um objeto com as variáveis extraídas da mensagem (ex: {"name": "Frank"}); null para outros tipos.

Use type "add_note" quando a mensagem pede para registrar uma observação, andamento ou nota em uma demanda existente.
Use type "manage_workflows" quando a mensagem pede para criar, listar, editar ou excluir workflows ou templates.
Exemplos de mensagens que indicam resolução: "foi resolvida", "já foi feito", "pode fechar", "concluído".
Retorne APENAS o JSON, sem explicações ou texto adicional.`;

function buildClassifyPrompt(activeWorkflows?: Array<{ id: string; name: string; description: string }>): string {
  if (!activeWorkflows?.length) return BASE_CLASSIFY_PROMPT;
  const workflowList = activeWorkflows
    .map(w => `  - id: "${w.id}", nome: "${w.name}", gatilho: "${w.description}"`)
    .join('\n');
  return `${BASE_CLASSIFY_PROMPT}

## Workflows ativos
Se a mensagem corresponder a um dos workflows abaixo, use type "trigger_workflow", preencha workflowId com o id correspondente e extraia as variáveis relevantes em workflowVariables:
${workflowList}`;
}

const MERGE_PROMPT = `Você está atualizando o resumo de uma demanda clínica.
Combine o resumo atual com a nova informação em um único resumo coeso, em português, máximo 120 caracteres.
Preserve o contexto original e acrescente o que for novo — não substitua, adicione.
Retorne APENAS o resumo combinado, sem explicações.`;

export async function mergeSummary(existingSummary: string, newMessage: string): Promise<string> {
  try {
    const result = await chat([
      { role: 'system', content: MERGE_PROMPT },
      { role: 'user', content: `Resumo atual: "${existingSummary}"\nNova informação: "${newMessage}"` }
    ]);
    return result.trim() || existingSummary;
  } catch {
    return existingSummary;
  }
}

export async function classify(
  message: string,
  activeWorkflows?: Array<{ id: string; name: string; description: string }>
): Promise<Classification> {
  try {
    const raw = await chat([
      { role: 'system', content: buildClassifyPrompt(activeWorkflows) },
      { role: 'user', content: message }
    ]);

    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return FALLBACK;

    const parsed = JSON.parse(json) as Partial<Classification>;
    const type = parsed.type ?? FALLBACK.type;
    const rawQF = parsed.queryFilters as Partial<QueryFilters> | null | undefined;
    const queryFilters: QueryFilters | null =
      type === 'query' && rawQF && typeof rawQF === 'object'
        ? {
            status: rawQF.status ?? 'open',
            category: rawQF.category ?? null,
            priority: rawQF.priority ?? null
          }
        : null;
    return {
      type,
      category: parsed.category ?? FALLBACK.category,
      priority: parsed.priority ?? FALLBACK.priority,
      summary: parsed.summary ?? FALLBACK.summary,
      demandIndex: typeof parsed.demandIndex === 'number' ? parsed.demandIndex : null,
      resolved: parsed.resolved === true,
      queryFilters,
      note: type === 'add_note' && typeof parsed.note === 'string' ? parsed.note : null,
      workflowId: type === 'trigger_workflow' && typeof parsed.workflowId === 'string' ? parsed.workflowId : null,
      workflowVariables: type === 'trigger_workflow' && parsed.workflowVariables && typeof parsed.workflowVariables === 'object'
        ? parsed.workflowVariables as Record<string, string>
        : null
    };
  } catch {
    return FALLBACK;
  }
}
