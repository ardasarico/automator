import { Type, type Static, type TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export class NodeConfigError extends Error {
  constructor(readonly paths: readonly string[]) {
    super(`Invalid node config at ${paths.join(", ") || "/"}`);
    this.name = "NodeConfigError";
  }
}

export function parseNodeConfig<T extends TObject>(schema: T, config: unknown): Static<T> {
  const value = Value.Clean(schema, Value.Default(schema, structuredClone(config ?? {})));
  if (!Value.Check(schema, value)) {
    const paths = [...Value.Errors(schema, value)].map((error) => error.path);
    throw new NodeConfigError([...new Set(paths)]);
  }
  return value as Static<T>;
}

export const emptyConfigSchema = Type.Object({});

export type { TObject } from "@sinclair/typebox";

export function secretFields(schema: TObject): string[] {
  return Object.entries(schema.properties)
    .filter(([, property]) => (property as { secret?: unknown }).secret === true)
    .map(([name]) => name);
}

export function redactSecrets<T extends object>(schema: TObject, config: T): T {
  const secrets = secretFields(schema);
  if (secrets.length === 0) return config;
  const redacted = { ...config } as Record<string, unknown>;
  for (const name of secrets) {
    if (!(name in redacted)) continue;
    const fallback = (schema.properties[name] as { default?: unknown }).default;
    if (fallback === undefined) delete redacted[name];
    else redacted[name] = fallback;
  }
  return redacted as T;
}
