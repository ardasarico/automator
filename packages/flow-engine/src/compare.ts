import type { ConditionOperator } from "@automator/contracts";

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function comparable(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "");
}

export function compare(left: unknown, operator: ConditionOperator, right: unknown): boolean {
  switch (operator) {
    case "equals":
      return comparable(left) === comparable(right);
    case "not_equals":
      return comparable(left) !== comparable(right);
    case "contains":
      if (Array.isArray(left)) return left.some((item) => comparable(item) === comparable(right));
      return comparable(left).includes(comparable(right));
    case "greater_than":
      return Number(left) > Number(right);
    case "less_than":
      return Number(left) < Number(right);
    case "is_empty":
      return isEmpty(left);
    case "is_not_empty":
      return !isEmpty(left);
  }
}
