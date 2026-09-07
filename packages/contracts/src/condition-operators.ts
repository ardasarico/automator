/** Comparisons a condition or filter can make; in its own file so config modules never cycle. */
export const conditionOperators = [
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "less_than",
  "is_empty",
  "is_not_empty",
] as const;
export type ConditionOperator = (typeof conditionOperators)[number];
