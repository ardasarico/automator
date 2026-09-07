import {
  isScreenNodeType,
  parseScreenConfig,
  samplePrivyUser,
  sampleWorldRejection,
  sampleWorldVerification,
  screenPorts,
  type FlowNode,
  type ScreenFormField,
} from "@automator/contracts";
import type { ExecutionOutputs } from "./executor";

/** A value Simulate types into a form field when the field names no `sample`. */
function sampleValue(field: ScreenFormField): string {
  if (field.sample !== "") return field.sample;
  switch (field.type) {
    case "email":
      return "visitor@example.com";
    case "number":
      return "1";
    default:
      return `Sample ${field.label || field.id}`;
  }
}

/**
 * What a screen produces when Simulate answers it instead of a visitor. The shape matches the
 * real mini-app (form values keyed by field id; `{ action: port }` for a button; the sample
 * visitor for a Privy login; a sample verification or rejection for a World ID check), so
 * the nodes after it see the same input either way, plus a `simulated` key naming the port
 * taken. That key is never a handle id, so no edge fires on it. Null for a node that is not
 * a screen.
 */
export function autoAnswer(node: FlowNode): ExecutionOutputs | null {
  if (!isScreenNodeType(node.type)) return null;
  if (node.type === "screen.form") {
    const config = parseScreenConfig(node.type, node.config);
    const values: Record<string, string> = {};
    for (const field of config.fields) {
      if (field.id !== "") values[field.id] = sampleValue(field);
    }
    const port = screenPorts(node.type).primary;
    return { [port]: values, simulated: { port } };
  }
  if (node.type === "privy.login") {
    const port = screenPorts(node.type).primary;
    return {
      [port]: samplePrivyUser(parseScreenConfig(node.type, node.config)),
      simulated: { port },
    };
  }
  if (node.type === "world.id-verify") {
    const config = parseScreenConfig(node.type, node.config);
    const ports = screenPorts(node.type);
    if (config.simulate === "rejected") {
      const port = ports.secondary ?? ports.primary;
      return { [port]: sampleWorldRejection, simulated: { port } };
    }
    return { [ports.primary]: sampleWorldVerification(config), simulated: { port: ports.primary } };
  }
  const port =
    node.type === "screen.confirmation"
      ? parseScreenConfig(node.type, node.config).simulate
      : screenPorts(node.type).primary;
  return { [port]: { action: port }, simulated: { port } };
}
