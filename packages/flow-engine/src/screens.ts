import {
  isScreenNodeType,
  parseScreenConfig,
  samplePrivyUser,
  sampleWorldRejection,
  sampleWorldSelfieCheck,
  sampleWorldSelfieRejection,
  sampleWorldVerification,
  screenPorts,
  type FlowNode,
  type ScreenFormField,
} from "@automator/contracts";
import type { ExecutionOutputs } from "./executor";

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

export function autoAnswer(node: FlowNode): ExecutionOutputs | null {
  if (!isScreenNodeType(node.type)) return null;
  if (node.type === "screen.form") {
    const config = parseScreenConfig(node.type, node.config);
    const values = Object.fromEntries(
      config.fields
        .filter((field) => field.id !== "")
        .map((field) => [field.id, sampleValue(field)]),
    );
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
  if (node.type === "world.selfie-check") {
    const config = parseScreenConfig(node.type, node.config);
    const ports = screenPorts(node.type);
    if (config.simulate === "rejected") {
      const port = ports.secondary ?? ports.primary;
      return { [port]: sampleWorldSelfieRejection, simulated: { port } };
    }
    return { [ports.primary]: sampleWorldSelfieCheck(config), simulated: { port: ports.primary } };
  }
  const port =
    node.type === "screen.confirmation"
      ? parseScreenConfig(node.type, node.config).simulate
      : screenPorts(node.type).primary;
  return { [port]: { action: port }, simulated: { port } };
}
