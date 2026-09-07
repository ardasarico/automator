import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";

/**
 * Secrets are per-user named values (API keys, webhook URLs) that node config references as
 * `{{secrets.<name>}}`. The API stores them encrypted and resolves them only while it runs a
 * flow; no endpoint ever returns a value, and the builder's in-browser preview leaves the
 * placeholder unresolved.
 */
export const secretNamePattern = "^[a-z][a-z0-9_]{0,63}$";
export const secretNameSchema = Type.String({ pattern: secretNamePattern });

export function isSecretName(value: string): boolean {
  return new RegExp(secretNamePattern).test(value);
}

export const secretSummarySchema = Type.Object({
  name: secretNameSchema,
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type SecretSummary = Static<typeof secretSummarySchema>;

export const secretValueInputSchema = Type.Object(
  { value: Type.String({ minLength: 1, maxLength: 4096 }) },
  { additionalProperties: false },
);
export type SecretValueInput = Static<typeof secretValueInputSchema>;

const secretParams = Type.Object({ name: secretNameSchema });

/** The caller's secret names, alphabetically; never the values. */
export const listSecretsContract = {
  method: "GET",
  path: "/secrets",
  response: {
    200: Type.Object({ secrets: Type.Array(secretSummarySchema) }),
    ...apiErrorResponses,
  },
} as const;
/** Creates the secret or replaces its value. */
export const putSecretContract = {
  method: "PUT",
  path: "/secrets/:name",
  params: secretParams,
  body: secretValueInputSchema,
  response: { 200: secretSummarySchema, ...apiErrorResponses },
} as const;
export const deleteSecretContract = {
  method: "DELETE",
  path: "/secrets/:name",
  params: secretParams,
  response: { 200: Type.Object({ name: secretNameSchema }), ...apiErrorResponses },
} as const;

/** The template that reads a secret in node config. */
export function secretTemplate(name: string): string {
  return `{{secrets.${name}}}`;
}

const secretPlaceholder = /\{\{\s*secrets\.([a-z][a-z0-9_]{0,63})\s*\}\}/g;

/** Every secret name a config's strings reference, in order of first use, without duplicates. */
export function secretReferences(config: unknown): string[] {
  const names: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(secretPlaceholder)) {
        const name = match[1]!;
        if (!names.includes(name)) names.push(name);
      }
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value !== null && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(config);
  return names;
}
