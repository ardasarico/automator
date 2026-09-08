"use client";

import {
  flowNodeConfigSchemas,
  parseNodeConfig,
  screenConfigSchemas,
  Value,
  type FlowNodeType,
  type TObject,
} from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Field, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { RiArrowLeftLine, RiBookmarkLine } from "@remixicon/react";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ObjectFields, type Property } from "../components/schema-form";
import { useDataTables } from "../data/tables-context";
import { categoryLabels, getCatalogEntry } from "./catalog";
import type { BuilderNode } from "./document";
import styles from "./flow-builder.module.css";
import type { BuilderState } from "./store";
import { useBuilderStore } from "./store-provider";
import { SavePresetDialog } from "./save-preset-dialog";
import { useRunPreview } from "./use-run-preview";
import { useSecrets } from "./secrets-store";
import { listVariables } from "./variables";

const selectGraph = (state: BuilderState) => ({ nodes: state.nodes, edges: state.edges });

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

function runTime(startedAt: string): string {
  const date = new Date(startedAt);
  return Number.isNaN(date.getTime())
    ? startedAt
    : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function NodeSettings({ node, onBack }: { node: BuilderNode; onBack(): void }) {
  const renameNode = useBuilderStore((state) => state.renameNode);
  const setNodeConfig = useBuilderStore((state) => state.setNodeConfig);
  const { nodes, edges } = useBuilderStore(useShallow(selectGraph));
  const secretNames = useSecrets(useShallow((state) => state.secrets.map((s) => s.name)));
  const { tables } = useDataTables();
  const variables = useMemo(
    () =>
      listVariables(
        node.id,
        nodes.map((item) => ({ id: item.id, ...item.data })),
        edges,
        secretNames,
        tables,
      ),
    [node.id, nodes, edges, secretNames, tables],
  );
  const runPreview = useRunPreview(node.id, node.data.config);
  const [saving, setSaving] = useState(false);
  const entry = getCatalogEntry(node.data.type);
  const schema = configSchemas[node.data.type];
  let config: unknown;
  let invalid = false;
  if (schema) {
    try {
      config = parseNodeConfig(schema, node.data.config);
    } catch {
      // Half-written settings must remain editable; strict validation belongs to the run gate.
      config = Value.Default(schema, structuredClone(node.data.config));
      invalid = true;
    }
  }
  const properties = schema ? (schema.properties as Record<string, Property>) : {};

  return (
    <div className={styles.nodeSettings}>
      <div className={styles.nodeSettingsHeader}>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <RiArrowLeftLine aria-hidden="true" />
          Nodes
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-caption text-muted-foreground">
            {categoryLabels[entry.category]} · {entry.label}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSaving(true)}>
            <RiBookmarkLine aria-hidden="true" />
            Save node
          </Button>
        </div>
      </div>
      {saving && <SavePresetDialog node={node} onClose={() => setSaving(false)} />}
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
          preview={runPreview?.preview}
        />
        {runPreview && (
          <p className="text-caption text-muted-foreground">
            Values below the fields come from the run at {runTime(runPreview.startedAt)}.
            {runPreview.stale && " These settings changed since, so they may no longer match."}
          </p>
        )}
        {invalid && (
          <p role="alert" className="text-caption text-destructive-text">
            Some settings are incomplete or invalid. Correct them before running the flow.
          </p>
        )}
        {!schema && (
          <p className="text-caption text-muted-foreground">This node has no settings yet.</p>
        )}
      </form>
    </div>
  );
}
