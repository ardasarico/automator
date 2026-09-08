import { Type, type Static, type TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { FlowNodeType } from "./flows";
import {
  identityScreenPorts,
  isIdentityScreenType,
  privyLoginConfigSchema,
  worldIdVerifyConfigSchema,
} from "./identity";

export const screenNodeTypes = [
  "screen.page",
  "screen.form",
  "screen.confirmation",
  "screen.qr-code",
  "privy.login",
  "world.id-verify",
] as const satisfies readonly FlowNodeType[];
export type ScreenNodeType = (typeof screenNodeTypes)[number];

export function isScreenNodeType(type: string): type is ScreenNodeType {
  return (screenNodeTypes as readonly string[]).includes(type);
}

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

const emailAnswer =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const numberAnswer = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function findScreenFormAnswerProblem(
  config: ScreenFormConfig,
  data: Record<string, string> | undefined,
): string | null {
  const fields = config.fields.filter((field) => field.id !== "");
  const fieldIds = new Set(fields.map((field) => field.id));
  for (const key of Object.keys(data ?? {}))
    if (!fieldIds.has(key)) return `Unknown form field "${key}"`;
  for (const field of fields) {
    const value = data && Object.hasOwn(data, field.id) ? data[field.id]! : "";
    if (value === "") {
      if (field.required) return `Form field "${field.id}" is required`;
      continue;
    }
    if (field.type === "email" && !emailAnswer.test(value.trim()))
      return `Form field "${field.id}" needs a valid email address`;
    if (field.type === "number" && (!numberAnswer.test(value) || !Number.isFinite(Number(value))))
      return `Form field "${field.id}" needs a finite number`;
  }
  return null;
}

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
  "privy.login": privyLoginConfigSchema,
  "world.id-verify": worldIdVerifyConfigSchema,
} as const satisfies Record<ScreenNodeType, TObject>;

export type ScreenConfig<T extends ScreenNodeType = ScreenNodeType> = Static<
  (typeof screenConfigSchemas)[T]
>;

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

export function visitorAnswer(port: string, data?: Record<string, string>): unknown {
  return data ?? { action: port };
}

export function screenPorts(type: ScreenNodeType): { primary: string; secondary?: string } {
  if (isIdentityScreenType(type)) return identityScreenPorts[type];
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
