/** The slice of a JSON Schema property this form engine reads. */
export type Property = {
  type?: string;
  /** The label to show. Falls back to a humanized property key when a schema sets none. */
  title?: string;
  anyOf?: { const?: unknown }[];
  description?: string;
  /** The standard JSON Schema hint; `date-time` renders a datetime control over a UTC ISO string. */
  format?: string;
  secret?: boolean;
  contentMediaType?: string;
  minimum?: number;
  maximum?: number;
  items?: Property;
  properties?: Record<string, Property>;
  /** Renders a picker over the account's data tables and stores the table id. */
  tableRef?: boolean;
  /** Renders a picker over the columns of the table the sibling `tableRef` field names. */
  columnRef?: boolean;
  /**
   * Names the sibling field holding the column this one filters, so an enum of operators can offer
   * only the ones that column's type supports. `ObjectFields` puts that column on the context.
   */
  operatorFor?: string;
  /** Folds the field under a collapsed "Advanced" section; see `sectionFields` in `layout.ts`. */
  advanced?: boolean;
  /** Puts the field under a named section; sections keep the order they first appear in. */
  group?: string;
  /** Renders the field only while a sibling holds the named value. */
  showWhen?: ShowWhen;
};

/** A field's visibility rule: the sibling `field` equals `equals`, or is a list holding `includes`. */
export type ShowWhen = { field: string; equals?: unknown; includes?: string };

/** What a field needs from its siblings: the table its object refers to, and the column it picked. */
export type FieldContext = {
  tableId?: string;
  columnId?: string;
};

/**
 * What a variable resolves to. The picker shows it, so a numeric comparison is not wired to an
 * object by mistake: `Number({…})` is NaN, and a condition on it is quietly false forever.
 */
export type VariableKind = "text" | "number" | "boolean" | "object" | "list";

/** A template the caller offers for insertion into a string field. */
export type VariableOption = {
  template: string;
  source: string;
  label: string;
  /** Left out when the shape is only known at run time, such as a model's own answer. */
  kind?: VariableKind;
};

/** What a template resolved to in the evidence the caller offers, usually the last run. */
export type TemplatePreview =
  | { status: "value"; text: string }
  | { status: "missing" }
  | { status: "secret" };

/** Resolves one template path (the text between the braces) for the preview under a field. */
export type PreviewTemplate = (path: string) => TemplatePreview;

export type FieldProps = {
  id: string;
  name: string;
  property: Property;
  value: unknown;
  onChange(value: unknown): void;
  variables?: VariableOption[];
  context?: FieldContext;
  /** Where the value lives in the document, such as `config.fields.0.id`; keys `problems`. */
  path?: string;
  /** Problems by path, shown under the field that owns each one. */
  problems?: FieldProblems;
};

/** What the flow checks found wrong with one setting. */
export type FieldProblem = { severity: "error" | "warning"; message: string };
export type FieldProblems = Readonly<Record<string, FieldProblem>>;

/** How much room a string field needs, and whether it holds code rather than prose. */
export type TextFieldShape = "line" | "multiline" | "code";

/*
 * A schema says what it can — `contentMediaType` already routes JSON to a checked editor — but the
 * node schemas carry no hint for prose or source, so the rest is keyed by the property names they
 * share. Anything absent stays a single line.
 */
const textFieldShapes = new Map<string, TextFieldShape>([
  /* Either a JSON array or a list of signatures, so it needs the room and the monospace but
   * never the JSON check — see the ABI field in `onchain-configs.ts`. */
  ["abi", "code"],
  ["body", "multiline"],
  ["code", "code"],
  ["content", "multiline"],
  ["description", "multiline"],
  ["instructions", "multiline"],
  ["message", "multiline"],
  ["prompt", "multiline"],
  ["samplePayload", "multiline"],
  ["task", "multiline"],
  ["text", "multiline"],
]);

export function textFieldShape(name: string, property: Pick<Property, "contentMediaType">) {
  const mediaType = property.contentMediaType ?? "";
  if (
    mediaType.endsWith("javascript") ||
    mediaType.endsWith("typescript") ||
    mediaType.endsWith("graphql")
  )
    return "code";
  return textFieldShapes.get(name) ?? "line";
}

/** Where the caret sits in a text control, as the DOM reports it. */
export type TextSelection = { start: number; end: number };

/** One `{{…}}` template, the unit a pick swaps rather than splits. */
const placeholder = /\{\{[^{}]*\}\}/g;
const onlyPlaceholder = /^\{\{[^{}]*\}\}$/;

/** The template a field holds when it holds exactly one and nothing else, trimmed; else null. */
export function singleTemplate(text: string): string | null {
  const trimmed = text.trim();
  return onlyPlaceholder.test(trimmed) ? trimmed : null;
}

/**
 * Where a picked variable lands in the text a field already holds. Appending was never right: the
 * fields that most want a variable start life holding a default placeholder, so the pick has to
 * replace what is there rather than sit beside it and resolve to nonsense.
 */
export function insertTemplate(
  text: string,
  template: string,
  selection?: TextSelection,
): { text: string; caret: number } {
  const replace = (from: number, to: number) => ({
    text: `${text.slice(0, from)}${template}${text.slice(to)}`,
    caret: from + template.length,
  });
  if (selection) {
    const start = Math.max(0, Math.min(selection.start, selection.end, text.length));
    const end = Math.max(0, Math.min(Math.max(selection.start, selection.end), text.length));
    // A selection says exactly what to swap, whatever it covers.
    if (start !== end) return replace(start, end);
    // A field whose whole value is one placeholder is a slot for a single value, not a sentence.
    if (onlyPlaceholder.test(text.trim())) return { text: template, caret: template.length };
    for (const match of text.matchAll(placeholder)) {
      const from = match.index;
      const to = from + match[0].length;
      // Inside an existing template, but not at either edge, where the writer means to add text.
      if (start > from && start < to) return replace(from, to);
    }
    return replace(start, start);
  }
  if (onlyPlaceholder.test(text.trim())) return { text: template, caret: template.length };
  const next = text === "" ? template : `${text} ${template}`;
  return { text: next, caret: next.length };
}

/** The label for a field: the schema's own words when it has them, its key humanized otherwise. */
export function fieldLabel(name: string, property: Pick<Property, "title">): string {
  return property.title ?? humanize(name);
}

export function humanize(key: string) {
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function singular(label: string) {
  return label.endsWith("s") ? label.slice(0, -1) : label;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function itemTitle(item: unknown, index: number, noun: string) {
  if (isRecord(item)) {
    for (const key of ["label", "name", "id"]) {
      const candidate = item[key];
      if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
    }
  }
  return `${noun} ${index + 1}`;
}
