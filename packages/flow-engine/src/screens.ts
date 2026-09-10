import {
  defaultChainId,
  isScreenNodeType,
  parseScreenConfig,
  samplePrivyUser,
  sampleUsdcPayment,
  sampleUsdcPaymentDeclined,
  sampleWorldRejection,
  sampleWorldSelfieCheck,
  sampleWorldSelfieRejection,
  sampleWorldVerification,
  screenPorts,
  type FlowNode,
  type ScreenFormField,
} from "@automator/contracts";
import type { ExecutionOutputs } from "./executor";
import { resolveTemplates, type TemplateScope } from "./template";

/** What a screen's auto-answer needs from the run to stand in for a real visitor. */
export interface AutoAnswerContext {
  /** Resolves the templates in a config whose answer carries real values, such as an amount. */
  scope?: TemplateScope;
  chainId?: number;
}

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

export function autoAnswer(
  node: FlowNode,
  context: AutoAnswerContext = {},
): ExecutionOutputs | null {
  if (!isScreenNodeType(node.type)) return null;
  if (node.type === "usdc.payment") {
    const parsed = parseScreenConfig(node.type, node.config);
    const config = context.scope ? resolveTemplates(parsed, context.scope) : parsed;
    const ports = screenPorts(node.type);
    if (config.simulate === "declined") {
      const port = ports.secondary ?? ports.primary;
      return { [port]: sampleUsdcPaymentDeclined, simulated: { port } };
    }
    return {
      [ports.primary]: sampleUsdcPayment(config, context.chainId ?? defaultChainId),
      simulated: { port: ports.primary },
    };
  }
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
