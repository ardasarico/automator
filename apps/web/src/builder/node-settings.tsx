"use client";

import {
  flowNodeConfigSchemas,
  parseNodeConfig,
  screenConfigSchemas,
  Value,
  type FlowNodeType,
  type TObject,
  type TSchema,
} from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Field, FieldDescription, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@automator/ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@automator/ui/select";
import { Switch } from "@automator/ui/switch";
import { Textarea } from "@automator/ui/textarea";
import {
  RiAddLine,
  RiArrowDownLine,
  RiArrowLeftLine,
  RiArrowUpLine,
  RiBracesLine,
  RiDeleteBinLine,
} from "@remixicon/react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { categoryLabels, getCatalogEntry } from "./catalog";
import type { BuilderNode } from "./document";
import styles from "./flow-builder.module.css";
import type { BuilderState } from "./store";
import { useBuilderStore } from "./store-provider";
import { MultiSelectField } from "./multi-select-field";
import { useSecrets } from "./secrets-store";
import { listVariables, type VariableOption } from "./variables";

const selectGraph = (state: BuilderState) => ({ nodes: state.nodes, edges: state.edges });

/** Every config schema the builder knows, by node type; types without one have no settings. */
const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

/** Fields that read as prose get a textarea; everything else a single line. */
const multilineKeys = new Set(["content", "body", "message", "description", "samplePayload"]);

function humanize(key: string) {
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Fields" → "field": the noun on an array's add button. */
function singular(label: string) {
  return label.endsWith("s") ? label.slice(0, -1) : label;
}

/** The JSON Schema keywords the generic form reads off a TypeBox property. */
type Property = {
  type?: string;
  anyOf?: { const?: unknown }[];
  description?: string;
  /** Marks credentials; the field suggests a `{{secrets.*}}` reference and stays plain otherwise. */
  secret?: boolean;
  minimum?: number;
  maximum?: number;
  items?: Property;
  properties?: Record<string, Property>;
};

type FieldProps = {
  id: string;
  name: string;
  property: Property;
  value: unknown;
  onChange(value: unknown): void;
  /** What `{{path}}` templates in this node's strings can reach; empty hides the picker. */
  variables?: VariableOption[];
};

/** Appends one of the reachable `{{path}}` templates to a string field. */
function VariablePicker({
  options,
  onPick,
}: {
  options: VariableOption[];
  onPick(template: string): void;
}) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Insert variable" />}>
        <RiBracesLine aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup align="end" className="w-64">
        <MenuGroup>
          <MenuGroupLabel>Insert variable</MenuGroupLabel>
          {options.map((option) => (
            <MenuItem key={option.template} onClick={() => onPick(option.template)}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{option.label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {option.source} · {option.template}
                </span>
              </span>
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function Help({ text }: { text: string | undefined }) {
  return text ? <FieldDescription>{text}</FieldDescription> : null;
}

function ConfigField({ id, name, property, value, onChange, variables = [] }: FieldProps) {
  const label = humanize(name);
  const options = property.anyOf
    ?.map((option) => option.const)
    .filter((option): option is string => typeof option === "string");

  if (options && options.length > 0) {
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Select
          items={options.map((option) => ({ value: option, label: humanize(option) }))}
          value={typeof value === "string" ? value : options[0]!}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger id={id} size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {humanize(option)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Help text={property.description} />
      </Field>
    );
  }
  if (property.type === "boolean") {
    return (
      <Field>
        <div className="flex w-full items-center justify-between gap-2">
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Switch id={id} checked={value === true} onCheckedChange={onChange} />
        </div>
        <Help text={property.description} />
      </Field>
    );
  }
  if (property.type === "number" || property.type === "integer") {
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          type="number"
          size="sm"
          min={property.minimum}
          max={property.maximum}
          value={typeof value === "number" ? value : ""}
          onChange={(event) => onChange(event.target.valueAsNumber)}
        />
        <Help text={property.description} />
      </Field>
    );
  }
  if (property.type === "string") {
    const text = typeof value === "string" ? value : "";
    return (
      <Field>
        <div className="flex w-full items-center justify-between gap-2">
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {variables.length > 0 && (
            <VariablePicker
              options={variables}
              onPick={(template) => onChange(text === "" ? template : `${text} ${template}`)}
            />
          )}
        </div>
        {multilineKeys.has(name) ? (
          <Textarea id={id} rows={4} value={text} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <Input
            id={id}
            size="sm"
            value={text}
            placeholder={property.secret ? "{{secrets.name}}" : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        <Help
          text={
            property.secret
              ? `${property.description ? `${property.description} ` : ""}Keep it out of the flow: store it in Variables and reference it as {{secrets.name}}.`
              : property.description
          }
        />
      </Field>
    );
  }
  if (property.type === "array" && property.items?.anyOf) {
    const options = property.items.anyOf
      .map((option) => option.const)
      .filter((option): option is string => typeof option === "string");
    return (
      <MultiSelectField
        id={id}
        label={label}
        options={options}
        value={value}
        description={property.description}
        onChange={onChange}
      />
    );
  }
  if (property.type === "array" && property.items?.type === "string") {
    return (
      <StringListField
        id={id}
        label={label}
        property={property}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (property.type === "array" && property.items?.properties) {
    return (
      <ArrayField
        id={id}
        label={label}
        property={property}
        value={value}
        onChange={onChange}
        variables={variables}
      />
    );
  }
  if (property.type === "object" && property.properties) {
    return (
      <Group label={label} description={property.description}>
        <ObjectFields
          id={id}
          properties={property.properties}
          value={value}
          onChange={(patch) => onChange({ ...(isRecord(value) ? value : {}), ...patch })}
          variables={variables}
        />
      </Group>
    );
  }
  return <p className="text-caption text-muted-foreground">{label} is not editable here yet.</p>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A list of short strings, typed as one comma-separated line; blanks are dropped. */
function StringListField({
  id,
  label,
  property,
  value,
  onChange,
}: Omit<FieldProps, "name"> & { label: string }) {
  const text = Array.isArray(value) ? value.filter((v) => typeof v === "string").join(", ") : "";
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        size="sm"
        defaultValue={text}
        placeholder="One, two, three"
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((item) => item.trim())
              .filter((item) => item !== ""),
          )
        }
      />
      <Help text={property.description ?? "Separate items with commas."} />
    </Field>
  );
}

/** A labelled box around related controls: an object property, or one item of an array. */
function Group({
  label,
  description,
  actions,
  children,
}: {
  label: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 rounded-lg border p-2">
      <div className="flex items-center gap-1">
        <legend className="contents">
          <span className="min-w-0 flex-1 truncate text-caption font-medium">{label}</span>
        </legend>
        {actions}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
    </fieldset>
  );
}

/** One field per property of an object schema, patching the object as a whole. */
function ObjectFields({
  id,
  properties,
  value,
  onChange,
  variables,
}: {
  id: string;
  properties: Record<string, Property>;
  value: unknown;
  onChange(patch: Record<string, unknown>): void;
  variables?: VariableOption[];
}) {
  const record = isRecord(value) ? value : {};
  return (
    <>
      {Object.entries(properties).map(([name, property]) => (
        <ConfigField
          key={name}
          id={`${id}-${name}`}
          name={name}
          property={property}
          value={record[name]}
          onChange={(next) => onChange({ [name]: next })}
          variables={variables}
        />
      ))}
    </>
  );
}

/** The name an array item shows in its header: its label or id when it has one. */
function itemTitle(item: unknown, index: number, noun: string) {
  if (isRecord(item)) {
    for (const key of ["label", "name", "id"]) {
      const candidate = item[key];
      if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
    }
  }
  return `${noun} ${index + 1}`;
}

/**
 * Object items as groups with move up, move down and remove, and an add button that creates
 * an item from the item schema's defaults. Items have no ids, so their index is their key.
 */
function ArrayField({
  id,
  label,
  property,
  value,
  onChange,
  variables,
}: Omit<FieldProps, "name"> & { label: string }) {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = property.items as TSchema;
  const noun = singular(label);
  const replace = (index: number, item: unknown) =>
    onChange(items.map((current, i) => (i === index ? item : current)));
  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-label">{label}</span>
        {/* Not a Field, so plain help text rather than FieldDescription. */}
        {property.description && (
          <p className="text-xs text-muted-foreground">{property.description}</p>
        )}
      </div>
      {items.map((item, index) => (
        <Group
          key={index}
          label={itemTitle(item, index, noun)}
          actions={
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Move ${noun} ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <RiArrowUpLine aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Move ${noun} ${index + 1} down`}
                disabled={index === items.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <RiArrowDownLine aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${noun} ${index + 1}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                <RiDeleteBinLine aria-hidden="true" />
              </Button>
            </>
          }
        >
          <ObjectFields
            id={`${id}-${index}`}
            properties={property.items!.properties!}
            value={item}
            onChange={(patch) => replace(index, { ...(isRecord(item) ? item : {}), ...patch })}
            variables={variables}
          />
        </Group>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...items, Value.Create(itemSchema)])}
      >
        <RiAddLine aria-hidden="true" />
        Add {noun.toLowerCase()}
      </Button>
    </div>
  );
}

/**
 * The left panel body while one node is selected: the node's label, then one field per
 * property of its config schema, written to the store as it is typed. Arrays of objects get
 * an item editor, string arrays a comma-separated line, and a property's schema description
 * renders as its help text. String fields offer an "Insert variable" menu of the `{{path}}`
 * templates reachable from upstream nodes. Types without a schema only offer the label.
 */
export function NodeSettings({ node, onBack }: { node: BuilderNode; onBack(): void }) {
  const renameNode = useBuilderStore((state) => state.renameNode);
  const setNodeConfig = useBuilderStore((state) => state.setNodeConfig);
  const { nodes, edges } = useBuilderStore(useShallow(selectGraph));
  const secretNames = useSecrets(useShallow((state) => state.secrets.map((s) => s.name)));
  const variables = useMemo(
    () =>
      listVariables(
        node.id,
        nodes.map((item) => ({ id: item.id, ...item.data })),
        edges,
        secretNames,
      ),
    [node.id, nodes, edges, secretNames],
  );
  const entry = getCatalogEntry(node.data.type);
  const schema = configSchemas[node.data.type];
  const config = schema ? parseNodeConfig(schema, node.data.config) : undefined;
  const properties = schema ? (schema.properties as Record<string, Property>) : {};

  return (
    <div className={styles.nodeSettings}>
      <div className={styles.nodeSettingsHeader}>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <RiArrowLeftLine aria-hidden="true" />
          Nodes
        </Button>
        <span className="text-caption text-muted-foreground">
          {categoryLabels[entry.category]} · {entry.label}
        </span>
      </div>
      <form className={styles.nodeSettingsForm} onSubmit={(event) => event.preventDefault()}>
        <Field>
          <FieldLabel htmlFor={`${node.id}-label`}>Label</FieldLabel>
          <Input
            id={`${node.id}-label`}
            size="sm"
            value={node.data.label}
            onChange={(event) => renameNode(node.id, event.target.value)}
          />
        </Field>
        <ObjectFields
          id={node.id}
          properties={properties}
          value={config}
          onChange={(patch) => setNodeConfig(node.id, patch)}
          variables={variables}
        />
        {!schema && (
          <p className="text-caption text-muted-foreground">This node has no settings yet.</p>
        )}
      </form>
    </div>
  );
}
