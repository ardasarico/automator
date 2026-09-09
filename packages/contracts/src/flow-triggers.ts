import type { FlowNodeType, FlowTriggerSummary } from "./flows";
import type { WatchComparison } from "./watch-configs";

type TriggerNode = { id: string; type: FlowNodeType; config?: Record<string, unknown> };

const comparisons: Record<WatchComparison, string> = {
  below: "below",
  at_or_below: "at or below",
  above: "above",
  at_or_above: "at or above",
};

function text(config: Record<string, unknown>, key: string, fallback: string): string {
  const value = config[key];
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function comparison(config: Record<string, unknown>): string {
  const value = text(config, "comparison", "below");
  return comparisons[value as WatchComparison] ?? comparisons.below;
}

/** Thresholds are stored as strings; group them so 2000 reads as a price, not an id. */
function amount(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("en-US") : value;
}

function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

/** The event signature carries its arguments; the name alone is what a sentence needs. */
function eventName(signature: string): string {
  const name = signature.split("(")[0]?.trim();
  return name === undefined || name === "" ? "an event" : name;
}

export function describeTrigger(node: TriggerNode): FlowTriggerSummary | null {
  const config = node.config ?? {};
  const summary = ((): string | null => {
    switch (node.type) {
      case "trigger.schedule":
        return `every ${text(config, "every", "1h")}`;
      case "trigger.price":
        return `when ${text(config, "pair", "ETH / USD")} is ${comparison(config)} ${amount(
          text(config, "threshold", "4000"),
        )}`;
      case "trigger.balance": {
        const address = text(config, "address", "");
        const who = address === "" ? "the wallet" : shortAddress(address);
        return `when ${who} holds ${comparison(config)} ${amount(text(config, "threshold", "1"))}`;
      }
      case "trigger.onchain-event": {
        const address = text(config, "address", "");
        const where = address === "" ? "" : ` from ${shortAddress(address)}`;
        return `on ${eventName(text(config, "event", ""))}${where}`;
      }
      case "trigger.webhook":
        return "when its webhook is called";
      case "trigger.manual":
        return "when you run it";
      case "trigger.miniapp-open":
        return "when someone opens the app";
      case "world.verification-completed":
        return "when a World ID check completes";
      default:
        return null;
    }
  })();
  return summary === null ? null : { nodeId: node.id, type: node.type, summary };
}

export function documentTriggers(nodes: readonly TriggerNode[]): FlowTriggerSummary[] {
  return nodes
    .map(describeTrigger)
    .filter((trigger): trigger is FlowTriggerSummary => trigger !== null);
}
