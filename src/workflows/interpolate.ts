const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_, key) => variables[key] ?? `{{${key}}}`);
}

export function extractVariableNames(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map(m => m[1]);
}

export function missingVariables(template: string, variables: Record<string, string>): string[] {
  return extractVariableNames(template).filter(k => !(k in variables));
}
