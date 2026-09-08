import { secretReferences } from "@automator/contracts";

export interface SecretsResolver {
  get(names: readonly string[]): Promise<Record<string, string>>;
}

export class SecretMissingError extends Error {
  constructor(readonly names: readonly string[]) {
    super(
      names.length === 1
        ? `Secret "${names[0]}" is not defined`
        : `Secrets ${names.map((name) => `"${name}"`).join(", ")} are not defined`,
    );
    this.name = "SecretMissingError";
  }
}

const unresolved: Record<string, string> = new Proxy(
  {},
  { get: (_target, name) => (typeof name === "string" ? `{{secrets.${name}}}` : undefined) },
);

export async function secretsScope(
  config: unknown,
  resolver: SecretsResolver | undefined,
): Promise<Record<string, string>> {
  const names = secretReferences(config);
  if (!resolver) return unresolved;
  if (names.length === 0) return {};
  const values = await resolver.get(names);
  const missing = names.filter((name) => !(name in values));
  if (missing.length > 0) throw new SecretMissingError(missing);
  return values;
}
