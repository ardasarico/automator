import type { Property, ShowWhen } from "./schema";

/**
 * Where each field of an object goes on the panel. The main section holds the fields a schema
 * says nothing about, in schema order; named groups follow in the order they first appear; the
 * advanced section comes last. Sections without fields are left out.
 */
export type FieldSection =
  | { kind: "main"; names: string[] }
  | { kind: "group"; label: string; names: string[] }
  | { kind: "advanced"; names: string[] };

export function sectionFields(properties: Record<string, Property>): FieldSection[] {
  const main: string[] = [];
  const groups = new Map<string, string[]>();
  const advanced: string[] = [];
  for (const [name, property] of Object.entries(properties)) {
    if (property.advanced) advanced.push(name);
    else if (property.group)
      groups.set(property.group, [...(groups.get(property.group) ?? []), name]);
    else main.push(name);
  }
  const sections: FieldSection[] = [];
  if (main.length > 0) sections.push({ kind: "main", names: main });
  for (const [label, names] of groups) sections.push({ kind: "group", label, names });
  if (advanced.length > 0) sections.push({ kind: "advanced", names: advanced });
  return sections;
}

/** Whether a field shows, given the values its siblings currently hold. */
export function isVisible(
  property: Pick<Property, "showWhen">,
  record: Record<string, unknown>,
): boolean {
  const rule: ShowWhen | undefined = property.showWhen;
  if (!rule) return true;
  const value = record[rule.field];
  if (rule.includes !== undefined) return Array.isArray(value) && value.includes(rule.includes);
  return Object.is(value, rule.equals);
}
