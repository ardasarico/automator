/** The slice of a JSON Schema property this form engine reads. */
export type Property = {
  type?: string;
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
};

/** What a field needs from its siblings: the table its object refers to, and the column it picked. */
export type FieldContext = {
  tableId?: string;
  columnId?: string;
};

/** A template the caller offers for insertion into a string field. */
export type VariableOption = {
  template: string;
  source: string;
  label: string;
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
  preview?: PreviewTemplate;
  context?: FieldContext;
};

export const multilineKeys = new Set([
  "content",
  "body",
  "message",
  "description",
  "samplePayload",
]);

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
