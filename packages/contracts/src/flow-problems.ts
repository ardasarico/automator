import { Type, type Static } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";
import { apiErrorCodeSchema } from "./contract";

/*
 * What a problem looks like on the wire, kept apart from the checks that find them (`flow-checks`)
 * so the flow contracts can answer with one without importing the checker, which reads the flow
 * schemas in turn. A leaf module: TypeBox and the shared error code, nothing else.
 */

export const flowProblemSchema = Type.Object({
  severity: Type.Union([Type.Literal("error"), Type.Literal("warning")]),
  nodeId: Type.Optional(Type.String()),
  /** The setting at fault, such as `config.fields.0.id`, when one setting is; the editor shows the problem under it. */
  path: Type.Optional(Type.String()),
  message: Type.String(),
});
export type FlowProblem = Static<typeof flowProblemSchema>;

/**
 * What the API answers when it refuses to activate a flow: the standard error code plus the
 * problems that stopped it, so the builder can name them rather than saying "it did not work".
 *
 * `problems` is optional because the same 422 also carries plain refusals, such as a patch body
 * the route could not read; that keeps this a widening of `apiErrorSchema` rather than a rival,
 * so a client reading the response against the plain error schema still matches.
 */
export const flowActivationRefusalSchema = Type.Object({
  error: apiErrorCodeSchema,
  problems: Type.Optional(Type.Array(flowProblemSchema, { maxItems: 50 })),
});
export type FlowActivationRefusal = Static<typeof flowActivationRefusalSchema>;

/** The problems in a refusal body, or an empty list when it carries none. */
export function refusedActivationProblems(body: unknown): FlowProblem[] {
  if (!Check(flowActivationRefusalSchema, body)) return [];
  return body.problems ?? [];
}
