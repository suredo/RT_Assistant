import { chat } from './glm';

export interface Classification {
  type: 'new_demand' | 'update' | 'query' | 'other';
  category: 'clinical_urgent' | 'team_management' | 'medical_team' | 'administrative' | 'regulatory' | 'routine';
  priority: 'high' | 'medium' | 'low';
  summary: string;
}

const FALLBACK: Classification = {
  type: 'new_demand',
  category: 'routine',
  priority: 'low',
  summary: 'Demanda não classificada'
};

const CLASSIFY_PROMPT = `Você é um classificador de demandas de uma clínica de hemodiálise.
Analise a mensagem e retorne SOMENTE um JSON válido com os campos:
- type: "new_demand" | "update" | "query" | "other"
- category: "clinical_urgent" | "team_management" | "medical_team" | "administrative" | "regulatory" | "routine"
- priority: "high" | "medium" | "low"
- summary: resumo curto da demanda em português (máximo 80 caracteres)

Retorne APENAS o JSON, sem explicações ou texto adicional.`;

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
      summary: parsed.summary ?? FALLBACK.summary
    };
  } catch {
    return FALLBACK;
  }
}
