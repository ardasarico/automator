import { Type, type Static, type TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/** Raised when a node's `config` cannot be read as its type's schema, naming the bad fields. */
export class NodeConfigError extends Error {
  constructor(readonly paths: readonly string[]) {
    super(`Invalid node config at ${paths.join(", ") || "/"}`);
    this.name = "NodeConfigError";
  }
}

/**
 * Reads a node's stored `config` as one type's schema: missing fields take the schema's
 * `default`, unknown fields are dropped, and anything left that does not check throws.
 * Every config schema gives each field a default, so an empty object is always valid.
 */
export function parseNodeConfig<T extends TObject>(schema: T, config: unknown): Static<T> {
  const value = Value.Clean(schema, Value.Default(schema, structuredClone(config ?? {})));
  if (!Value.Check(schema, value)) {
    const paths = [...Value.Errors(schema, value)].map((error) => error.path);
    throw new NodeConfigError([...new Set(paths)]);
  }
  return value as Static<T>;
}

/** The empty config: for node types with nothing to set up yet. */
export const emptyConfigSchema = Type.Object({});

/** Re-exported so packages that read node configs can type their schemas without TypeBox. */
export type { TObject } from "@sinclair/typebox";

/**
 * Marker convention for secrets: a config field declared with `secret: true` in its schema
 * options (for example a webhook URL) holds a credential. Secrets never leave the owner's
 * flow: marketplace snapshots blank them, and a fork shows them as "set your own".
 */
export function secretFields(schema: TObject): string[] {
  return Object.entries(schema.properties)
    .filter(([, property]) => (property as { secret?: unknown }).secret === true)
    .map(([name]) => name);
}

/** The config with every secret field reset to its schema default (or removed without one). */
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
