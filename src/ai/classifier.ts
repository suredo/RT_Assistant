import { chat } from './glm';

export interface QueryFilters {
  status: 'open' | 'resolved' | 'all';
  category: string | null;
  priority: 'high' | 'medium' | 'low' | null;
}

export interface Classification {
  type: 'new_demand' | 'update' | 'query' | 'other';
  category: 'urgência clínica' | 'gestão de equipe' | 'equipe médica' | 'administrativo' | 'regulatório' | 'rotina';
  priority: 'high' | 'medium' | 'low';
  summary: string;
  demandIndex: number | null; // 1-based index of the demand being referenced, if any
  resolved: boolean;          // true when Bianca is closing/resolving the demand
  queryFilters: QueryFilters | null; // non-null only when type === 'query'
}

const FALLBACK: Classification = {
  type: 'new_demand',
  category: 'rotina',
  priority: 'low',
  summary: 'Demanda não classificada',
  demandIndex: null,
  resolved: false,
  queryFilters: null
};

const CLASSIFY_PROMPT = `Você é um classificador de demandas de uma clínica de hemodiálise.
Analise a mensagem e retorne SOMENTE um JSON válido com os campos:
- type: "new_demand" | "update" | "query" | "other"
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

Exemplos de mensagens que indicam resolução: "foi resolvida", "já foi feito", "pode fechar", "concluído".
Retorne APENAS o JSON, sem explicações ou texto adicional.`;

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

export async function classify(message: string): Promise<Classification> {
  try {
    const raw = await chat([
      { role: 'system', content: CLASSIFY_PROMPT },
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
      queryFilters
    };
  } catch {
    return FALLBACK;
  }
}
