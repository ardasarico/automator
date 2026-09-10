"use client";

import {
  flowNodeConfigSchemas,
  parseNodeConfig,
  screenConfigSchemas,
  Value,
  type FlowNodeType,
  type TObject,
} from "@automator/contracts";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ObjectFields,
  quietHelpClass,
  type FieldProblems,
  type Property,
} from "../components/schema-form";
import { useDataTables } from "../data/tables-context";
import { isFlowNode, type FlowBuilderNode } from "./document";
import { NodeHeader } from "./node-header";
import { NodeLastRun } from "./node-last-run";
import styles from "./node-settings.module.css";
import { SavePresetDialog } from "./save-preset-dialog";
import { useSecrets } from "./secrets-store";
import type { BuilderState } from "./store";
import { useBuilderStore } from "./store-provider";
import { useFlowProblems } from "./use-flow-problems";
import { useRunPreview } from "./use-run-preview";
import { listVariables } from "./variables";

const selectGraph = (state: BuilderState) => ({ nodes: state.nodes, edges: state.edges });

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

export function NodeSettings({
  node,
  onBack,
  actions,
  readOnly = false,
}: {
  node: FlowBuilderNode;
  onBack(): void;
  /** Extra header controls, such as the AI panel's "Ask AI about this node". */
  actions?: React.ReactNode;
  /** Shows the settings without letting the reader change them, e.g. while an AI draft previews. */
  readOnly?: boolean;
}) {
  const renameNode = useBuilderStore((state) => state.renameNode);
  const setNodeConfig = useBuilderStore((state) => state.setNodeConfig);
  const duplicateNodes = useBuilderStore((state) => state.duplicateNodes);
  const removeNode = useBuilderStore((state) => state.removeNode);
  const { nodes, edges } = useBuilderStore(useShallow(selectGraph));
  const secretNames = useSecrets(useShallow((state) => state.secrets.map((s) => s.name)));
  const { tables } = useDataTables();
  const variables = useMemo(
    () =>
      listVariables(
        node.id,
        nodes.filter(isFlowNode).map((item) => ({ id: item.id, ...item.data })),
        edges,
        secretNames,
        tables,
      ),
    [node.id, nodes, edges, secretNames, tables],
  );
  /* The same checks the run gate uses: the badge counts what blocks this node, and every problem
   * that names a setting is shown under that setting. */
  const flowProblems = useFlowProblems();
  const { issues, problems } = useMemo(() => {
    const own = flowProblems.filter((problem) => problem.nodeId === node.id);
    const problems: FieldProblems = Object.fromEntries(
      own
        .filter((problem) => problem.path !== undefined)
        .map((problem) => [
          problem.path!,
          { severity: problem.severity, message: problem.message },
        ]),
    );
    return { issues: own.filter((problem) => problem.severity === "error").length, problems };
  }, [flowProblems, node.id]);
  const runPreview = useRunPreview(node.id, node.data.config);
  const [saving, setSaving] = useState(false);
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
    <div className={styles.panel}>
      <NodeHeader
        node={node}
        issues={issues}
        actions={actions}
        readOnly={readOnly}
        onBack={onBack}
        onRename={(label) => renameNode(node.id, label)}
        onDuplicate={() => duplicateNodes([node.id])}
        onSavePreset={() => setSaving(true)}
        onDelete={() => {
          removeNode(node.id);
          onBack();
        }}
      />
      {saving && <SavePresetDialog node={node} onClose={() => setSaving(false)} />}
      <form
        className={`${styles.form} ${quietHelpClass}`}
        onSubmit={(event) => event.preventDefault()}
      >
        {readOnly && <p className={styles.note}>Preview of the AI draft. Apply it to edit.</p>}
        <fieldset className={styles.fields} disabled={readOnly}>
          <ObjectFields
            id={node.id}
            properties={properties}
            value={config}
            onChange={(patch) => setNodeConfig(node.id, patch)}
            variables={variables}
            path="config"
            problems={problems}
            sectioned
          />
        </fieldset>
        {invalid && (
          <p role="alert" className="text-caption text-destructive-text">
            Some settings are incomplete or invalid. Correct them before running the flow.
          </p>
        )}
        {!schema && (
          <p className="text-caption text-muted-foreground">This node has no settings yet.</p>
        )}
      </form>
      {runPreview && (
        <NodeLastRun nodeId={node.id} config={node.data.config} preview={runPreview} />
      )}
    </div>
  );
}
