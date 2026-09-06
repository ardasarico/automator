import { Type, type Static } from "@sinclair/typebox";

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

export const livenessContract = {
  method: "GET",
  path: "/health/live",
  response: { 200: Type.Object({ status: Type.Literal("ok") }) },
} as const;
export type LivenessResponse = Static<(typeof livenessContract.response)[200]>;

export const apiInfoContract = {
  method: "GET",
  path: "/",
  response: { 200: Type.Object({ name: Type.Literal("Automator API") }) },
} as const;
export type ApiInfoResponse = Static<(typeof apiInfoContract.response)[200]>;
