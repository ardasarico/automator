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
