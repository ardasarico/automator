/**
 * Checks a value against the subset of JSON Schema that extraction schemas use: `type`
 * (single or list), `enum`, `const`, `properties` + `required` + `additionalProperties: false`,
 * `items`, and `nullable`. Anything else in the schema is ignored rather than rejected, so an
 * unknown keyword never blocks a run; the model is asked for the same schema, so the check is
 * a guard against wrong shapes, not a full validator.
 */
export type JsonSchema = Record<string, unknown>;

function hasType(schema: JsonSchema, value: unknown): boolean {
  const declared = schema.type;
  if (declared === undefined) return true;
  const types = Array.isArray(declared) ? declared : [declared];
  if (schema.nullable === true && value === null) return true;
  return types.some((type) => {
    switch (type) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && Number.isFinite(value);
      case "integer":
        return Number.isInteger(value);
      case "boolean":
        return typeof value === "boolean";
      case "null":
        return value === null;
      case "array":
        return Array.isArray(value);
      case "object":
        return typeof value === "object" && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  });
}

export function matchesJsonSchema(schema: JsonSchema, value: unknown): boolean {
  if (!hasType(schema, value)) return false;
  if (value === null && schema.nullable === true) return true;
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) return false;
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))
  )
    return false;
  if (Array.isArray(value) && typeof schema.items === "object" && schema.items !== null) {
    const items = schema.items as JsonSchema;
    if (!value.every((item) => matchesJsonSchema(items, item))) return false;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    if (required.some((key) => !(key in record))) return false;
    for (const [key, property] of Object.entries(properties)) {
      if (key in record && !matchesJsonSchema(property, record[key])) return false;
    }
    if (schema.additionalProperties === false)
      if (Object.keys(record).some((key) => !(key in properties))) return false;
  }
  return true;
}
