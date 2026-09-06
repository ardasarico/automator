import { Type, type Static } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";
export * from "./auth";

const unavailableDatabaseSchema = Type.Union([
  Type.Literal("down"),
  Type.Literal("not_configured"),
]);
export const databaseStatusSchema = Type.Union([Type.Literal("up"), unavailableDatabaseSchema]);
export type DatabaseStatus = Static<typeof databaseStatusSchema>;

const healthySchema = Type.Object({
  status: Type.Literal("ok"),
  checks: Type.Object({ api: Type.Literal("up"), database: Type.Literal("up") }),
  checkedAt: Type.String(),
});
const unhealthySchema = Type.Object({
  status: Type.Literal("error"),
  checks: Type.Object({ api: Type.Literal("up"), database: unavailableDatabaseSchema }),
  checkedAt: Type.String(),
});

export const healthContract = {
  method: "GET",
  path: "/health",
  response: { 200: healthySchema, 503: unhealthySchema },
} as const;
export type HealthResponse = Static<(typeof healthContract.response)[200 | 503]>;

export function parseHealthResponse(httpStatus: number, body: unknown): HealthResponse {
  if (httpStatus === 200 && Check(healthContract.response[200], body)) return body;
  if (httpStatus === 503 && Check(healthContract.response[503], body)) return body;
  throw new Error("Response does not match the health contract");
}

export const livenessContract = {
  method: "GET",
  path: "/health/live",
  response: Type.Object({ status: Type.Literal("ok") }),
} as const;
export type LivenessResponse = Static<typeof livenessContract.response>;

export const apiInfoContract = {
  method: "GET",
  path: "/",
  response: Type.Object({ name: Type.Literal("Automator API") }),
} as const;
export type ApiInfoResponse = Static<typeof apiInfoContract.response>;
