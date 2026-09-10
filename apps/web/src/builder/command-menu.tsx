"use client";

import type { FlowNodeType } from "@automator/contracts";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@automator/ui/dialog";
import { Input } from "@automator/ui/input";
import { RiSearchLine } from "@remixicon/react";
import { useReactFlow } from "@xyflow/react";
import { useMemo, useState } from "react";
import { useBuilderDialogs } from "./builder-dialogs";
import { catalog, searchCatalog, type CatalogEntry } from "./catalog";
import { useAddNodeAtCenter, useInsertNodeAtCenter } from "./flow-canvas";
import styles from "./flow-builder.module.css";
import { useFlowActivation } from "./flow-activation";
import { useNodePresets } from "./presets-context";
import { useSaveFlowController } from "./save-button";
import { useBuilderStore } from "./store-provider";
import { useFlowRun } from "./use-flow-run";
import { useHotkey } from "../lib/hotkeys";

type Command = { id: string; label: string; hint?: string; run(): void };
type Section = { key: string; label: string; commands: Command[] };

function matches(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle);
}

/**
 * One place to reach every builder action: the flow's own commands, the node catalog and the
 * account's saved nodes, filtered together by what the reader types.
 */
export function CommandMenu() {
  const [query, setQuery] = useState("");
  const dialogs = useBuilderDialogs();
  const open = dialogs.current === "commands";
  const { fitView } = useReactFlow();
  const { run } = useFlowRun();
  const { save } = useSaveFlowController();
  const undo = useBuilderStore((state) => state.undo);
  const redo = useBuilderStore((state) => state.redo);
  const { liveMode } = useFlowActivation();
  const addAtCenter = useAddNodeAtCenter();
  const insertAtCenter = useInsertNodeAtCenter();
  const { presets } = useNodePresets();

  useHotkey(
    "mod+k",
    (event) => {
      event.preventDefault();
      setQuery("");
      dialogs.open("commands");
    },
    { scope: "canvas", allowInEditable: true },
  );

  const needle = query.trim().toLowerCase();

  const sections = useMemo<Section[]>(() => {
    const close = (action: () => void) => () => {
      dialogs.close();
      action();
    };
    const flowCommands: Command[] = [
      {
        id: "run",
        label: liveMode ? "Run live" : "Run flow",
        hint: "⌘⏎",
        run: close(() => void run()),
      },
      { id: "save", label: "Save flow", hint: "⌘S", run: close(() => void save()) },
      { id: "undo", label: "Undo", hint: "⌘Z", run: close(undo) },
      { id: "redo", label: "Redo", hint: "⇧⌘Z", run: close(redo) },
      {
        id: "fit",
        label: "Fit the flow in view",
        run: close(() => void fitView({ padding: 0.2, duration: 200 })),
      },
      { id: "settings", label: "Flow settings", run: close(() => dialogs.open("settings")) },
      { id: "share", label: "Share as a mini app", run: close(() => dialogs.open("share-app")) },
      { id: "use-api", label: "Use as API", run: close(() => dialogs.open("use-api")) },
      {
        id: "publish",
        label: "Publish to the marketplace",
        run: close(() => dialogs.open("listing")),
      },
    ];
    const addNode = (entry: CatalogEntry): Command => ({
      id: `node:${entry.type}`,
      label: `Add ${entry.label}`,
      hint: entry.description,
      run: close(() => addAtCenter(entry.type as FlowNodeType)),
    });
    const entries = needle === "" ? [] : searchCatalog(query).flatMap((group) => group.entries);
    const savedNodes = presets
      .filter((preset) => needle === "" || matches(preset.name, needle))
      .map((preset) => ({
        id: `preset:${preset.id}`,
        label: `Add ${preset.name}`,
        hint: "Saved node",
        run: close(() =>
          insertAtCenter({ type: preset.type, label: preset.label, config: preset.config }),
        ),
      }));
    const sections: Section[] = [];
    const filtered = flowCommands.filter(
      (command) => needle === "" || matches(command.label, needle),
    );
    if (filtered.length > 0) sections.push({ key: "flow", label: "Flow", commands: filtered });
    if (savedNodes.length > 0)
      sections.push({ key: "saved", label: "Saved nodes", commands: savedNodes });
    if (entries.length > 0)
      sections.push({ key: "nodes", label: "Add a node", commands: entries.map(addNode) });
    // With nothing typed the catalog would bury the flow commands, so it waits for a query.
    if (needle === "" && catalog.length > 0)
      sections.push({
        key: "hint",
        label: "Nodes",
        commands: [
          {
            id: "search-nodes",
            label: "Type to search the node catalog",
            run: () => {},
          },
        ],
      });
    return sections;
  }, [
    addAtCenter,
    dialogs,
    fitView,
    insertAtCenter,
    liveMode,
    needle,
    presets,
    query,
    redo,
    run,
    save,
    undo,
  ]);

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(next) => !next && dialogs.close()}>
      <DialogPopup className="max-w-lg" aria-label="Commands">
        <DialogHeader className="sr-only">
          <DialogTitle>Commands</DialogTitle>
          <DialogDescription>Search the builder&apos;s actions and nodes.</DialogDescription>
        </DialogHeader>
        <div className={styles.nodePickerSearch}>
          <div className={styles.paletteSearch}>
            <RiSearchLine aria-hidden="true" className={styles.paletteSearchIcon} />
            <Input
              ref={(element) => element?.focus()}
              size="sm"
              type="search"
              aria-label="Search commands"
              placeholder="Search commands and nodes"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {sections.length === 0 ? (
            <p className={styles.nodePickerEmpty} role="status">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            sections.map((section) => (
              <section key={section.key} className={styles.paletteGroup} aria-label={section.label}>
                <p className={styles.paletteGroupLabel}>{section.label}</p>
                {section.commands.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    className={styles.paletteItem}
                    onClick={command.run}
                  >
                    <span className={styles.paletteItemText}>
                      <span className={styles.paletteItemLabel}>{command.label}</span>
                      {command.hint && (
                        <span className={styles.paletteItemDescription}>{command.hint}</span>
                      )}
                    </span>
                  </button>
                ))}
              </section>
            ))
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
