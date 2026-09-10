"use client";

import { Input } from "@automator/ui/input";
import { RiAlertLine, RiErrorWarningLine, RiSearchLine } from "@remixicon/react";
import { useId, useState } from "react";
import { getCatalogEntry } from "./catalog";
import { CatalogIconMark } from "./catalog-icon";
import styles from "./flow-builder.module.css";
import { selectFlowNodes } from "./store";
import { useBuilderStore } from "./store-provider";
import { useFlowProblems } from "./use-flow-problems";
import { useSelectNode } from "./use-select-node";

export function FlowOutline() {
  const nodes = useBuilderStore(selectFlowNodes);
  const problems = useFlowProblems();
  const selectNode = useSelectNode();
  const [query, setQuery] = useState("");
  const searchId = useId();
  const needle = query.trim().toLowerCase();
  const visible = nodes.filter((node) => {
    if (!needle) return true;
    const entry = getCatalogEntry(node.data.type);
    return `${node.data.label} ${entry.label}`.toLowerCase().includes(needle);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {problems.length > 0 && (
        <section className={styles.outlineProblems} aria-label="Problems">
          <p className={styles.paletteGroupLabel}>
            {problems.length === 1 ? "1 problem" : `${problems.length} problems`}
          </p>
          <ul>
            {problems.map((problem, index) => {
              const Icon = problem.severity === "error" ? RiErrorWarningLine : RiAlertLine;
              const content = (
                <>
                  <Icon aria-hidden="true" className={styles.outlineProblemIcon} />
                  <span>{problem.message}</span>
                </>
              );
              return (
                <li key={`${problem.nodeId ?? "flow"}-${index}`} data-severity={problem.severity}>
                  {problem.nodeId ? (
                    <button
                      type="button"
                      className={styles.outlineProblem}
                      onClick={() => selectNode(problem.nodeId!)}
                    >
                      {content}
                    </button>
                  ) : (
                    <p className={styles.outlineProblem}>{content}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className={styles.paletteTools}>
        <label htmlFor={searchId} className="sr-only">
          Search this flow
        </label>
        <div className={styles.paletteSearch}>
          <RiSearchLine aria-hidden="true" className={styles.paletteSearchIcon} />
          <Input
            id={searchId}
            type="search"
            size="sm"
            placeholder="Search this flow"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {nodes.length === 0 ? (
          <div className={styles.paletteEmpty}>
            <p>The canvas is empty.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className={styles.paletteEmpty}>
            <p>No nodes match.</p>
          </div>
        ) : (
          <ul className={styles.paletteGroup} aria-label="Nodes on the canvas">
            {visible.map((node) => {
              const entry = getCatalogEntry(node.data.type);
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    className={styles.paletteItem}
                    aria-current={node.selected ? "true" : undefined}
                    onClick={() => selectNode(node.id)}
                  >
                    <span className={styles.nodeIcon} data-group={entry.group}>
                      <CatalogIconMark icon={entry.icon} />
                    </span>
                    <span className={styles.paletteItemText}>
                      <span className={styles.paletteItemLabel}>{node.data.label}</span>
                      <span className={styles.paletteItemDescription}>{entry.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
