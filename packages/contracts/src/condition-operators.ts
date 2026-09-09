export const conditionOperators = [
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "greater_or_equal",
  "less_than",
  "less_or_equal",
  "is_empty",
  "is_not_empty",
] as const;
export type ConditionOperator = (typeof conditionOperators)[number];

/**
 * The operators that order two values. Both sides have to resolve to a number for the question to
 * mean anything, so the engine fails a node whose ordering operand is not one.
 */
export const orderingOperators = [
  "greater_than",
  "greater_or_equal",
  "less_than",
  "less_or_equal",
] as const;
export type OrderingOperator = (typeof orderingOperators)[number];

export function isOrderingOperator(operator: ConditionOperator): operator is OrderingOperator {
  return (orderingOperators as readonly ConditionOperator[]).includes(operator);
}
