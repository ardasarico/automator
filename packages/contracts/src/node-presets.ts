import { Type, type Static } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";
import { apiErrorResponses } from "./contract";
import { flowNodeConfigSchemas } from "./flow-node-configs";
import { flowNodeTypeSchema, type FlowNodeType } from "./flows";
import { redactSecrets, type TObject } from "./node-config";
import { screenConfigSchemas } from "./screens";

/** A saved node is one node's settings, kept privately for reuse in any of the owner's flows. */
export const nodePresetSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1, maxLength: 64 }),
  type: flowNodeTypeSchema,
  label: Type.String({ maxLength: 120 }),
  config: Type.Record(Type.String(), Type.Unknown()),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type NodePreset = Static<typeof nodePresetSchema>;

export const nodePresetInputSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 64, pattern: "\\S" }),
    type: flowNodeTypeSchema,
    label: Type.String({ maxLength: 120 }),
    config: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);
export type NodePresetInput = Static<typeof nodePresetInputSchema>;

export function isNodePresetInput(body: unknown): body is NodePresetInput {
  return Check(nodePresetInputSchema, body);
}

export const nodePresetLimit = 50;

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

/**
 * A preset keeps `{{secrets.name}}` references but never a pasted credential: every field the
 * node's schema marks secret is reset before the preset is stored.
 */
export function redactPresetConfig(
  type: FlowNodeType,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const schema = configSchemas[type];
  return schema ? redactSecrets(schema, config) : config;
}

const presetParamsSchema = Type.Object({ id: Type.String({ minLength: 1 }) });

export const listNodePresetsContract = {
  method: "GET",
  path: "/node-presets",
  response: {
    200: Type.Object({ presets: Type.Array(nodePresetSchema) }),
    ...apiErrorResponses,
  },
} as const;
export const createNodePresetContract = {
  method: "POST",
  path: "/node-presets",
  body: nodePresetInputSchema,
  response: { 201: nodePresetSchema, ...apiErrorResponses },
} as const;
export const deleteNodePresetContract = {
  method: "DELETE",
  path: "/node-presets/:id",
  params: presetParamsSchema,
  response: {
    200: Type.Object({ id: Type.String({ minLength: 1 }) }),
    ...apiErrorResponses,
  },
} as const;

export type ListNodePresetsResponse = Static<(typeof listNodePresetsContract.response)[200]>;
