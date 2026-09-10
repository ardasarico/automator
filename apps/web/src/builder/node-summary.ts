import { describeNode, type DataTable, type FlowNodeType } from "@automator/contracts";
import { getCatalogEntry } from "./catalog";

type SummaryInput = { id: string; type: FlowNodeType; config: Record<string, unknown> };

/**
 * The line under a card's title. Data nodes name their table, which only the web knows;
 * everything else comes from the shared summary, and a node with no rule shows what its
 * type does so the line is never blank.
 */
export function nodeSummary(node: SummaryInput, tables: readonly DataTable[]): string {
  if (node.type.startsWith("data.")) {
    const tableId = node.config["tableId"];
    if (typeof tableId !== "string" || tableId === "") return "no table yet";
    const table = tables.find((entry) => entry.id === tableId);
    return table ? `in ${table.name}` : "table not found";
  }
  return describeNode(node) ?? getCatalogEntry(node.type).description;
}

/** The kinds of node whose card takes a different shape from the plain step. */
export type NodeFamily = "trigger" | "screen" | "branch" | "step";

/** Logic that ends in a choice between its outputs; a loop's item/done pair is not a choice. */
const branchTypes = new Set<FlowNodeType>(["logic.condition", "logic.switch", "logic.filter"]);

export function nodeFamily(type: FlowNodeType): NodeFamily {
  const category = getCatalogEntry(type).category;
  if (category === "trigger") return "trigger";
  if (category === "screen") return "screen";
  if (branchTypes.has(type)) return "branch";
  return "step";
}

function str(config: Record<string, unknown>, key: string, fallback = ""): string {
  const value = config[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

/**
 * What a screen puts in front of the visitor, one short line per thing, in the order they
 * appear: the card lists them instead of a summary sentence. Never empty.
 */
export function screenItems(node: SummaryInput): string[] {
  const config = node.config;
  const items: string[] = [];
  switch (node.type) {
    case "screen.page":
      if (str(config, "body") !== "") items.push("Body text");
      items.push(`${str(config, "button", "Continue")} button`);
      break;
    case "screen.form": {
      const fields = Array.isArray(config["fields"]) ? config["fields"] : [];
      for (const field of fields) {
        if (typeof field !== "object" || field === null) continue;
        const label = "label" in field && typeof field.label === "string" ? field.label.trim() : "";
        const id = "id" in field && typeof field.id === "string" ? field.id.trim() : "";
        items.push(`${label || id || "Untitled"} field`);
      }
      if (items.length === 0) items.push("No fields yet");
      items.push(`${str(config, "submit", "Submit")} button`);
      break;
    }
    case "screen.confirmation":
      if (str(config, "message") !== "") items.push("Message");
      items.push(
        `${str(config, "confirm", "Confirm")} / ${str(config, "cancel", "Cancel")} buttons`,
      );
      break;
    case "screen.qr-code":
      items.push(str(config, "value") === "" ? "QR code placeholder" : "QR code");
      if (str(config, "caption") !== "") items.push("Caption");
      items.push(`${str(config, "button", "Continue")} button`);
      break;
    default:
      items.push(getCatalogEntry(node.type).description);
  }
  return items;
}
