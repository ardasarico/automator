import { Type, type Static, type TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { FlowNodeType } from "./flows";

/**
 * Visitor-facing node types: what the mini-app renders. The visitor's choice on a screen
 * picks the output port the flow continues on (page → next, form → submitted,
 * confirmation → confirmed or cancelled, qr-code → next).
 */
export const screenNodeTypes = [
  "screen.page",
  "screen.form",
  "screen.confirmation",
  "screen.qr-code",
] as const satisfies readonly FlowNodeType[];
export type ScreenNodeType = (typeof screenNodeTypes)[number];

export function isScreenNodeType(type: string): type is ScreenNodeType {
  return (screenNodeTypes as readonly string[]).includes(type);
}

/** Every field defaults, so an untouched node (`config: {}`) still renders. A blank title falls back to the node label. */
const text = (fallback = "", description?: string) =>
  Type.String(
    description === undefined ? { default: fallback } : { default: fallback, description },
  );

const titleText = () => text("", "Blank shows the node label.");

export const screenPageConfigSchema = Type.Object({
  title: titleText(),
  body: text("", "Paragraphs are kept."),
  button: text("Continue", "Continues on the Next port."),
});
export type ScreenPageConfig = Static<typeof screenPageConfigSchema>;

export const screenFormFieldTypes = ["text", "email", "number", "textarea"] as const;
export type ScreenFormFieldType = (typeof screenFormFieldTypes)[number];

export const screenFormFieldSchema = Type.Object({
  id: text("", "Key of the value in the submitted data, such as email."),
  label: text(),
  type: Type.Union(
    screenFormFieldTypes.map((type) => Type.Literal(type)),
    { default: "text" },
  ),
  placeholder: text(),
  required: Type.Boolean({ default: false }),
  sample: text("", "What Simulate types into this field; blank uses a value for the type."),
});
export type ScreenFormField = Static<typeof screenFormFieldSchema>;

export const screenFormConfigSchema = Type.Object({
  title: titleText(),
  description: text(),
  fields: Type.Array(screenFormFieldSchema, {
    default: [],
    description: "Submitted values travel on the Submitted port, keyed by field id.",
  }),
  submit: text("Submit"),
});
export type ScreenFormConfig = Static<typeof screenFormConfigSchema>;

export const screenConfirmationConfigSchema = Type.Object({
  title: titleText(),
  message: text(),
  confirm: text("Confirm", "Continues on the Confirmed port."),
  cancel: text("Cancel", "Continues on the Cancelled port."),
  simulate: Type.Union([Type.Literal("confirmed"), Type.Literal("cancelled")], {
    default: "confirmed",
    description: "Which answer Simulate takes.",
  }),
});
export type ScreenConfirmationConfig = Static<typeof screenConfirmationConfigSchema>;

export const screenQrCodeConfigSchema = Type.Object({
  title: titleText(),
  value: text("", "The text to encode; blank shows a placeholder instead of a code."),
  caption: text(),
  button: text("Continue"),
});
export type ScreenQrCodeConfig = Static<typeof screenQrCodeConfigSchema>;

export const screenConfigSchemas = {
  "screen.page": screenPageConfigSchema,
  "screen.form": screenFormConfigSchema,
  "screen.confirmation": screenConfirmationConfigSchema,
  "screen.qr-code": screenQrCodeConfigSchema,
} as const satisfies Record<ScreenNodeType, TObject>;

export type ScreenConfig<T extends ScreenNodeType = ScreenNodeType> = Static<
  (typeof screenConfigSchemas)[T]
>;

/**
 * Reads a node's `config` as its screen's settings. Rendering must never throw, so this is
 * lenient: missing fields take their defaults, unknown keys are dropped, and a wrongly typed
 * value is replaced rather than rejected. The input is not mutated.
 */
export function parseScreenConfig<T extends ScreenNodeType>(
  type: T,
  config: unknown,
): ScreenConfig<T> {
  const schema = screenConfigSchemas[type];
  const source = typeof config === "object" && config !== null ? Value.Clone(config) : {};
  const withDefaults = Value.Default(schema, source);
  const cleaned = Value.Clean(schema, withDefaults);
  return Value.Cast(schema, cleaned) as ScreenConfig<T>;
}

/**
 * The visitor's value for a screen's port: a form hands over what was typed, keyed by field
 * id; any other action hands over which port was taken, so a condition can read it.
 */
export function visitorAnswer(port: string, data?: Record<string, string>): unknown {
  return data ?? { action: port };
}

/** The output port each visitor action on a screen continues on. */
export function screenPorts(type: ScreenNodeType): { primary: string; secondary?: string } {
  switch (type) {
    case "screen.page":
    case "screen.qr-code":
      return { primary: "next" };
    case "screen.form":
      return { primary: "submitted" };
    case "screen.confirmation":
      return { primary: "confirmed", secondary: "cancelled" };
  }
}
