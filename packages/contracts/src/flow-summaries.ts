import type { ConditionOperator } from "./condition-operators";
import { flowNodeCategory } from "./flow-categories";
import { describeTrigger } from "./flow-triggers";
import type { FlowNodeType } from "./flows";

type SummaryNode = { id: string; type: FlowNodeType; config?: Record<string, unknown> };

const operatorSymbols: Record<ConditionOperator, string> = {
  equals: "=",
  not_equals: "≠",
  contains: "contains",
  greater_than: ">",
  greater_or_equal: "≥",
  less_than: "<",
  less_or_equal: "≤",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

const mergeModes: Record<string, string> = {
  combine: "combine both inputs",
  first: "first input wins",
  list: "both inputs as a list",
};

/** The summary is one line on a card; anything longer gets an ellipsis, never a wrap. */
const maxLength = 48;

function text(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

function count(config: Record<string, unknown>, key: string): number {
  const value = config[key];
  return Array.isArray(value) ? value.length : 0;
}

/** `{{input.amount}}` reads as `input.amount`: the braces say "template" to the engine, not to a person. */
function template(value: string): string {
  return value.replace(/\{\{\s*([^}]*?)\s*\}\}/g, "$1");
}

function shortAddress(value: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(value) ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function clip(value: string): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength - 1)}…` : oneLine;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function operator(config: Record<string, unknown>): string {
  const value = text(config, "operator") as ConditionOperator;
  return operatorSymbols[value] ?? operatorSymbols.equals;
}

function comparison(config: Record<string, unknown>, leftKey: string, rightKey: string): string {
  const left = template(text(config, leftKey)) || "value";
  const symbol = operator(config);
  if (symbol === "is empty" || symbol === "is not empty") return `${left} ${symbol}`;
  const right = template(text(config, rightKey)) || "…";
  return `${left} ${symbol} ${right}`;
}

function recipient(config: Record<string, unknown>, key: string, fallback: string): string {
  const value = template(text(config, key));
  return value === "" ? fallback : shortAddress(value);
}

/**
 * What a node is set to do, as the sentence fragment its card shows under the title. `null`
 * means the node has nothing worth stating beyond its type, and the card falls back to the
 * catalog description; a summary never reads "undefined" or an empty template.
 */
export function describeNode(node: SummaryNode): string | null {
  const config = node.config ?? {};
  if (flowNodeCategory[node.type] === "trigger") return describeTrigger(node)?.summary ?? null;
  const summary = ((): string | null => {
    switch (node.type) {
      case "logic.condition":
        return comparison(config, "left", "right");
      case "logic.switch": {
        const cases = count(config, "cases");
        return cases === 0 ? "no cases yet" : plural(cases, "case");
      }
      case "logic.wait": {
        const seconds = config["seconds"];
        return `wait ${typeof seconds === "number" ? seconds : 1}s`;
      }
      case "logic.for-each":
        return `each of ${template(text(config, "items")) || "input.items"}`;
      case "logic.merge":
        return mergeModes[text(config, "mode")] ?? mergeModes["combine"]!;
      case "logic.filter":
        return text(config, "field") === ""
          ? "keep every item"
          : `keep where ${comparison(config, "field", "value")}`;
      case "logic.set-variable": {
        const name = text(config, "name");
        return name === ""
          ? "unnamed variable"
          : `${name} = ${template(text(config, "value")) || "…"}`;
      }
      case "logic.run-code": {
        const code = text(config, "code");
        return code === "" ? "no code yet" : clip(code);
      }
      case "logic.return": {
        const outputs = config["outputs"];
        const names = Array.isArray(outputs)
          ? outputs
              .map((output) =>
                typeof output === "object" && output !== null && "name" in output
                  ? String(output.name).trim()
                  : "",
              )
              .filter((name) => name !== "")
          : [];
        return names.length === 0 ? "answers with nothing yet" : `answers with ${names.join(", ")}`;
      }
      case "onchain.read-contract":
      case "onchain.write-contract": {
        const fn = text(config, "functionName");
        const address = text(config, "address");
        if (fn === "") return "no function set";
        return address === "" ? `${fn}()` : `${fn}() on ${shortAddress(address)}`;
      }
      case "onchain.transfer-token":
        return `send ${template(text(config, "amount")) || "…"} to ${recipient(config, "to", "…")}`;
      case "onchain.sign-message":
        return `sign ${template(text(config, "message")) || "…"}`;
      case "ai.agent":
        return clip(text(config, "task")) || "no task set";
      case "ai.generate-text":
        return clip(template(text(config, "prompt"))) || "no prompt set";
      case "ai.classify": {
        const labels = count(config, "labels");
        return labels === 0 ? "no labels yet" : `into ${plural(labels, "label")}`;
      }
      case "ai.extract":
        return text(config, "schema") === "" ? "no fields yet" : "extract fields";
      case "screen.page":
      case "screen.confirmation":
      case "screen.qr-code":
        return clip(text(config, "title")) || null;
      case "screen.form": {
        const fields = count(config, "fields");
        const title = clip(text(config, "title"));
        const shape = fields === 0 ? "no fields yet" : plural(fields, "field");
        return title === "" ? shape : `${title} · ${shape}`;
      }
      case "notify.discord":
        return clip(template(text(config, "content"))) || "no message yet";
      case "notify.telegram":
        return clip(template(text(config, "text"))) || "no message yet";
      case "notify.email": {
        const to = text(config, "to");
        const subject = clip(text(config, "subject"));
        if (to === "" && subject === "") return "no recipient yet";
        return to === "" ? subject : subject === "" ? `to ${to}` : `to ${to} · ${subject}`;
      }
      case "world.id-verify":
      case "world.selfie-check": {
        const action = text(config, "action");
        return action === "" ? "no action set" : `action ${action}`;
      }
      case "privy.sign-transaction": {
        const value = template(text(config, "value"));
        const to = recipient(config, "to", "…");
        return value === "" || value === "0" ? `to ${to}` : `${value} to ${to}`;
      }
      case "usdc.payment":
        return `collect ${template(text(config, "amount")) || "…"} USDC`;
      case "usdc.payout":
        return `${template(text(config, "amount")) || "…"} USDC to ${recipient(config, "to", "…")}`;
      case "usdc.balance": {
        const address = text(config, "address");
        return address === "" ? "your wallet" : shortAddress(template(address));
      }
      case "graph.query-subgraph": {
        const subgraph = text(config, "subgraph");
        return subgraph === "" ? "no subgraph set" : clip(subgraph);
      }
      default:
        return null;
    }
  })();
  return summary === null || summary === "" ? null : summary;
}
