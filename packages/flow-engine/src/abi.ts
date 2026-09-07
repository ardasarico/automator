import { parseAbi, type Abi, type AbiFunction, type AbiParameter } from "viem";
import { NodeExecutionError } from "./executor";

/** Reads an ABI typed into a config: a JSON array, or human-readable signatures one per line. */
export function parseAbiText(text: string): Abi {
  const trimmed = text.trim();
  if (!trimmed) throw new NodeExecutionError("The node needs an ABI");
  if (trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as Abi;
    } catch {
      throw new NodeExecutionError("The ABI is not valid JSON");
    }
  }
  try {
    return parseAbi(
      trimmed
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
  } catch {
    throw new NodeExecutionError("The ABI signatures could not be parsed");
  }
}

export function findFunction(abi: Abi, functionName: string): AbiFunction {
  const entry = abi.find(
    (item): item is AbiFunction => item.type === "function" && item.name === functionName,
  );
  if (!entry) throw new NodeExecutionError(`The ABI has no function "${functionName}"`);
  return entry;
}

/** Reads the args typed into a config as a JSON array; templates have already been resolved. */
export function parseArgsText(text: unknown): unknown[] {
  if (Array.isArray(text)) return text;
  if (typeof text !== "string") throw new NodeExecutionError("Arguments must be a JSON array");
  if (!text.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new NodeExecutionError("Arguments are not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new NodeExecutionError("Arguments must be a JSON array");
  return parsed;
}

/**
 * JSON cannot carry bigints, so integers arrive as strings or numbers; this turns them into
 * what the ABI expects, recursing into arrays and tuples. Anything else passes through for
 * viem to validate.
 */
export function coerceArgs(
  parameters: readonly AbiParameter[],
  args: readonly unknown[],
): unknown[] {
  if (args.length !== parameters.length)
    throw new NodeExecutionError(`Expected ${parameters.length} arguments, got ${args.length}`);
  return parameters.map((parameter, index) => coerceValue(parameter, args[index]));
}

function coerceValue(parameter: AbiParameter, value: unknown): unknown {
  const type = parameter.type;
  if (type.endsWith("]")) {
    if (!Array.isArray(value))
      throw new NodeExecutionError(`"${parameter.name ?? type}" must be an array`);
    const itemType = type.slice(0, type.lastIndexOf("["));
    return value.map((item) => coerceValue({ ...parameter, type: itemType }, item));
  }
  if (type === "tuple" && "components" in parameter && Array.isArray(value))
    return coerceArgs(parameter.components, value);
  if (/^u?int\d*$/.test(type)) {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
    if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
    throw new NodeExecutionError(`"${parameter.name ?? type}" must be an integer`);
  }
  if (type === "bool") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new NodeExecutionError(`"${parameter.name ?? type}" must be true or false`);
  }
  return value;
}

/** Run outputs travel as JSON: bigints become decimal strings, recursively. */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = jsonSafe(item);
    return out;
  }
  return value;
}

/** The ERC-20 surface the token nodes use. */
export const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);
