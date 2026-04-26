import { chat } from './glm';

export interface Classification {
  type: 'new_demand' | 'update' | 'query' | 'other';
  category: 'clinical_urgent' | 'team_management' | 'medical_team' | 'administrative' | 'regulatory' | 'routine';
  priority: 'high' | 'medium' | 'low';
  summary: string;
  demandIndex: number | null; // 1-based index of the demand being referenced, if any
  resolved: boolean;          // true when Bianca is closing/resolving the demand
}

const FALLBACK: Classification = {
  type: 'new_demand',
  category: 'routine',
  priority: 'low',
  summary: 'Demanda não classificada',
  demandIndex: null,
  resolved: false
};

const CLASSIFY_PROMPT = `Você é um classificador de demandas de uma clínica de hemodiálise.
Analise a mensagem e retorne SOMENTE um JSON válido com os campos:
- type: "new_demand" | "update" | "query" | "other"
- category: "clinical_urgent" | "team_management" | "medical_team" | "administrative" | "regulatory" | "routine"
- priority: "high" | "medium" | "low"
- summary: resumo curto da demanda em português (máximo 80 caracteres)
- demandIndex: número inteiro da demanda referenciada (ex: se a mensagem menciona "demanda 2" retorne 2), ou null se não há referência
- resolved: true se a mensagem indica que a demanda foi resolvida/concluída/fechada, false caso contrário

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
    return {
      type: parsed.type ?? FALLBACK.type,
      category: parsed.category ?? FALLBACK.category,
      priority: parsed.priority ?? FALLBACK.priority,
      summary: parsed.summary ?? FALLBACK.summary,
      demandIndex: typeof parsed.demandIndex === 'number' ? parsed.demandIndex : null,
      resolved: parsed.resolved === true
    };
  } catch {
    return FALLBACK;
  }
}
