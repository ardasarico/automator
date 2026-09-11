import {
  isOrderingOperator,
  type ConditionOperator,
  type OrderingOperator,
} from "@automator/contracts";
import { NodeExecutionError } from "./executor";

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function comparable(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "");
}

/**
 * A comparison that could not be made at all, as opposed to one that came out false. Ordering an
 * object, a blank field or a word against a number has no answer, and answering `false` sends a
 * flow down a branch nobody chose. It extends NodeExecutionError so an unwrapped one still lands
 * on the normal node-failure path rather than crashing a run.
 */
export class ComparisonError extends NodeExecutionError {
  constructor(message: string) {
    super(message);
    this.name = "ComparisonError";
  }
}

const orderingLabels: Record<OrderingOperator, string> = {
  greater_than: "greater than",
  greater_or_equal: "greater or equal",
  less_than: "less than",
  less_or_equal: "less or equal",
};

/**
 * Names the offending value's shape, never its content: the message becomes the persisted node
 * error, and an operand may be a resolved secret or a visitor's data.
 */
export function describeValue(value: unknown): string {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (value === "") return "an empty string";
  if (typeof value === "string") return value.trim() === "" ? "a blank string" : "a string";
  if (typeof value === "number") return Number.isFinite(value) ? "a number" : "a non-finite number";
  if (typeof value === "boolean") return "a boolean";
  if (Array.isArray(value))
    return value.length === 1 ? "an array of 1 item" : `an array of ${value.length} items`;
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

function operand(value: unknown, side: "left" | "right", operator: OrderingOperator): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const whole =
    value !== null && typeof value === "object"
      ? " Compare one of its fields instead of the whole value."
      : "";
  throw new ComparisonError(
    `“${orderingLabels[operator]}” needs a number on the ${side}, but got ${describeValue(value)}.${whole}`,
  );
}

/**
 * Ordering operators throw a ComparisonError when either side is not a number; the lenient
 * operators keep answering true or false for anything.
 */
export function compare(left: unknown, operator: ConditionOperator, right: unknown): boolean {
  if (isOrderingOperator(operator)) {
    const a = operand(left, "left", operator);
    const b = operand(right, "right", operator);
    switch (operator) {
      case "greater_than":
        return a > b;
      case "greater_or_equal":
        return a >= b;
      case "less_than":
        return a < b;
      case "less_or_equal":
        return a <= b;
    }
  }
  switch (operator) {
    case "equals":
      return comparable(left) === comparable(right);
    case "not_equals":
      return comparable(left) !== comparable(right);
    case "contains":
      if (Array.isArray(left)) return left.some((item) => comparable(item) === comparable(right));
      return comparable(left).includes(comparable(right));
    case "is_empty":
      return isEmpty(left);
    case "is_not_empty":
      return !isEmpty(left);
  }
}

/**
 * The comparison as a node makes it: an unusable operand becomes that node's failure, named so the
 * run view says which node and which side to fix.
 */
export function compareForNode(
  where: string,
  left: unknown,
  operator: ConditionOperator,
  right: unknown,
): boolean {
  try {
    return compare(left, operator, right);
  } catch (error) {
    if (error instanceof ComparisonError)
      throw new NodeExecutionError(`${where}: ${error.message}`);
    throw error;
  }
}
