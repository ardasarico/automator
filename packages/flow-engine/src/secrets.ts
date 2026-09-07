import { secretReferences } from "@automator/contracts";

/**
 * Where `{{secrets.<name>}}` values come from while a flow runs. Only a server holds one:
 * the API decrypts the flow owner's secrets for the names a node references, right before
 * that node runs. Names the owner never defined are left out of the answer.
 */
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

/**
 * Without a resolver (the builder's in-browser preview), templates keep their placeholder
 * text instead of resolving to nothing, so an author can see where a secret would go.
 */
const unresolved: Record<string, string> = new Proxy(
  {},
  { get: (_target, name) => (typeof name === "string" ? `{{secrets.${name}}}` : undefined) },
);

/**
 * The `secrets` scope for one node's templates: the values its config references. A
 * referenced name the resolver does not answer fails the node, so a misspelt secret is a
 * visible error rather than an empty string sent to a webhook.
 */
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
