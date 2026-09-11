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
import { useEffect, useMemo, useRef, useState } from "react";
import { useBuilderDialogs } from "./builder-dialogs";
import { catalog, searchCatalog, type CatalogEntry } from "./catalog";
import { useAddNodeAtCenter, useInsertNodeAtCenter } from "./flow-canvas";
import styles from "./flow-builder.module.css";
import { useFlowActivation } from "./flow-activation";
import { useNodePresets } from "./presets-context";
import { useSaveFlowController } from "./save-button";
import { selectCanRedo, selectCanUndo } from "./store";
import { useBuilderStore } from "./store-provider";
import { useFlowRun } from "./use-flow-run";
import { useHotkey } from "../lib/hotkeys";
import { useShortcut } from "../lib/shortcuts";

type Command = {
  id: string;
  label: string;
  hint?: string;
  /** Listed so its shortcut can be found, but held until what it acts on is there. */
  disabled?: boolean;
  run(): void;
};
type Section = { key: string; label: string; commands: Command[] };

function matches(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle);
}

/** The index of the next command that can run, `steps` away from `from` and wrapping around. */
function nextRunnable(commands: readonly Command[], from: number, step: 1 | -1): number {
  const count = commands.length;
  for (let offset = 1; offset <= count; offset += 1) {
    const index = (from + step * offset + count) % count;
    if (!commands[index]?.disabled) return index;
  }
  return Math.max(0, Math.min(from, count - 1));
}

/**
 * One place to reach every builder action: the flow's own commands, the node catalog and the
 * account's saved nodes, filtered together by what the reader types.
 */
export function CommandMenu() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const dialogs = useBuilderDialogs();
  const open = dialogs.current === "commands";
  const { fitView } = useReactFlow();
  const { run } = useFlowRun();
  const { save } = useSaveFlowController();
  const undo = useBuilderStore((state) => state.undo);
  const redo = useBuilderStore((state) => state.redo);
  const canUndo = useBuilderStore(selectCanUndo);
  const canRedo = useBuilderStore(selectCanRedo);
  const duplicateNodes = useBuilderStore((state) => state.duplicateNodes);
  const selectAll = useBuilderStore((state) => state.selectAll);
  const groupNodes = useBuilderStore((state) => state.groupNodes);
  const ungroup = useBuilderStore((state) => state.ungroup);
  // The same selection rules as the canvas hotkeys, so the menu and the keys agree.
  const selectedIds = useBuilderStore((state) =>
    state.nodes
      .filter((node) => node.selected)
      .map((node) => node.id)
      .join(","),
  );
  const selectedGroupId = useBuilderStore(
    (state) => state.nodes.find((node) => node.selected && node.type === "group")?.id ?? null,
  );
  const { liveMode } = useFlowActivation();
  const addAtCenter = useAddNodeAtCenter();
  const insertAtCenter = useInsertNodeAtCenter();
  const { presets } = useNodePresets();
  const keys = {
    run: useShortcut("mod+enter"),
    save: useShortcut("mod+s"),
    undo: useShortcut("mod+z"),
    redo: useShortcut("mod+shift+z"),
    duplicate: useShortcut("mod+d"),
    group: useShortcut("mod+g"),
    ungroup: useShortcut("mod+shift+g"),
    selectAll: useShortcut("mod+a"),
  };

  useHotkey(
    "mod+k",
    (event) => {
      event.preventDefault();
      setQuery("");
      setActive(0);
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
    const ids = selectedIds === "" ? [] : selectedIds.split(",");
    const flowCommands: Command[] = [
      {
        id: "run",
        label: liveMode ? "Run live" : "Run flow",
        hint: keys.run,
        run: close(() => void run()),
      },
      { id: "save", label: "Save flow", hint: keys.save, run: close(() => void save()) },
      { id: "undo", label: "Undo", hint: keys.undo, disabled: !canUndo, run: close(undo) },
      { id: "redo", label: "Redo", hint: keys.redo, disabled: !canRedo, run: close(redo) },
      {
        id: "duplicate",
        label: "Duplicate",
        hint: keys.duplicate,
        disabled: ids.length === 0,
        run: close(() => void duplicateNodes(ids)),
      },
      {
        id: "group",
        label: "Group",
        hint: keys.group,
        disabled: ids.length === 0,
        run: close(() => void groupNodes(ids)),
      },
      {
        id: "ungroup",
        label: "Ungroup",
        hint: keys.ungroup,
        disabled: selectedGroupId === null,
        run: close(() => selectedGroupId && ungroup(selectedGroupId)),
      },
      { id: "select-all", label: "Select all", hint: keys.selectAll, run: close(selectAll) },
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
    canRedo,
    canUndo,
    dialogs,
    duplicateNodes,
    fitView,
    groupNodes,
    insertAtCenter,
    keys.duplicate,
    keys.group,
    keys.redo,
    keys.run,
    keys.save,
    keys.selectAll,
    keys.undo,
    keys.ungroup,
    liveMode,
    needle,
    presets,
    query,
    redo,
    run,
    save,
    selectAll,
    selectedGroupId,
    selectedIds,
    undo,
    ungroup,
  ]);

  /* The keyboard walks one flat list across the sections, the way the node picker does. */
  const commands = useMemo(() => sections.flatMap((section) => section.commands), [sections]);
  // A held command is listed but never highlighted: the ring steps over it in both directions.
  const highlighted = commands.length === 0 ? 0 : nextRunnable(commands, active - 1, 1);
  const current = commands[highlighted];

  useEffect(() => {
    list.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [current]);

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
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive(nextRunnable(commands, highlighted, 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive(nextRunnable(commands, highlighted, -1));
                } else if (event.key === "Enter" && current && !current.disabled) {
                  event.preventDefault();
                  current.run();
                }
              }}
            />
          </div>
        </div>
        <div ref={list} className="max-h-80 overflow-y-auto">
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
                    className={`${styles.paletteItem} disabled:opacity-50`}
                    data-command={command.label}
                    data-active={command.id === current?.id || undefined}
                    disabled={command.disabled}
                    onMouseEnter={() => setActive(commands.indexOf(command))}
                    onClick={command.run}
                  >
                    <span className={styles.paletteItemText}>
                      <span className={styles.paletteItemLabel}>{command.label}</span>
                      {command.hint && (
                        <span className={styles.paletteItemDescription} data-hint="">
                          {command.hint}
                        </span>
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
