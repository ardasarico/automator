import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";

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

export const listSecretsContract = {
  method: "GET",
  path: "/secrets",
  response: {
    200: Type.Object({ secrets: Type.Array(secretSummarySchema) }),
    ...apiErrorResponses,
  },
} as const;
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

export function secretTemplate(name: string): string {
  return `{{secrets.${name}}}`;
}

const secretPlaceholder = /\{\{\s*secrets\.([a-z][a-z0-9_]{0,63})\s*\}\}/g;

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
