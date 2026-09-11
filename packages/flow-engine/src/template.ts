/* A whole-placeholder string preserves the value's type; embedded placeholders stringify it. */

export interface TemplateScope {
  input: Record<string, unknown>;
  vars: Record<string, unknown>;
  trigger: unknown;
  secrets?: Record<string, string>;
}

const placeholder = /\{\{\s*([^{}]+?)\s*\}\}/g;
const wholePlaceholder = /^\{\{\s*([^{}]+?)\s*\}\}$/;

export function lookupPath(scope: TemplateScope, path: string): unknown {
  let current: unknown = scope;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * A resolved value as the text a node sends or shows: strings as they are, nothing for a missing
 * value, and JSON for anything structured. The one reading every executor shares.
 */
export function valueText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function resolveTemplate(text: string, scope: TemplateScope): unknown {
  const whole = wholePlaceholder.exec(text);
  if (whole) return lookupPath(scope, whole[1]!) ?? "";
  return text.replace(placeholder, (_match, path: string) => valueText(lookupPath(scope, path)));
}

export function resolveTemplates<T>(value: T, scope: TemplateScope): T {
  if (typeof value === "string") return resolveTemplate(value, scope) as T;
  if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, scope)) as T;
  if (value !== null && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) resolved[key] = resolveTemplates(item, scope);
    return resolved as T;
  }
  return value;
}
