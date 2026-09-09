"use client";

import { Button } from "@automator/ui/button";
import { Menu, MenuGroupLabel, MenuItem, MenuPopup, MenuTrigger } from "@automator/ui/menu";
import { RiAlertLine, RiErrorWarningLine } from "@remixicon/react";
import { useReactFlow } from "@xyflow/react";
import { getCatalogEntry } from "./catalog";
import styles from "./flow-builder.module.css";
import { useBuilderStore } from "./store-provider";
import { useSelectNode } from "./use-select-node";
import { useFlowProblems } from "./use-flow-problems";
import { countErrors, type FlowProblem } from "./validation";

/**
 * Every problem in the flow, in one control. Node badges say a card has one; this says how many
 * there are in total, what each one is, and takes the reader to the node it belongs to.
 */
export function FlowProblemsButton() {
  const problems = useFlowProblems();
  const nodes = useBuilderStore((state) => state.nodes);
  const selectNode = useSelectNode();
  const { fitView } = useReactFlow();
  if (problems.length === 0) return null;

  const errors = countErrors(problems);
  const label = problems.length === 1 ? "1 problem" : `${problems.length} problems`;

  function nodeLabel(problem: FlowProblem): string | null {
    const node = problem.nodeId ? nodes.find((entry) => entry.id === problem.nodeId) : undefined;
    if (!node) return null;
    return node.data.label || getCatalogEntry(node.data.type).label;
  }

  function reveal(problem: FlowProblem) {
    if (!problem.nodeId) return;
    selectNode(problem.nodeId);
    void fitView({ nodes: [{ id: problem.nodeId }], maxZoom: 1.2, duration: 200 });
  }

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={styles.problemsTrigger}
            data-tone={errors > 0 ? "error" : "warning"}
          />
        }
      >
        {errors > 0 ? (
          <RiErrorWarningLine aria-hidden="true" />
        ) : (
          <RiAlertLine aria-hidden="true" />
        )}
        {label}
      </MenuTrigger>
      <MenuPopup align="start" className="max-w-96">
        <MenuGroupLabel>
          {errors > 0 ? "Problems to fix before running" : "Warnings"}
        </MenuGroupLabel>
        {problems.map((problem, index) => {
          const name = nodeLabel(problem);
          return (
            <MenuItem
              key={`${problem.nodeId ?? "flow"}-${index}`}
              disabled={!problem.nodeId}
              onClick={() => reveal(problem)}
            >
              <span className={styles.problemItem} data-severity={problem.severity}>
                {name && <span className={styles.problemNode}>{name}</span>}
                <span>{problem.message}</span>
              </span>
            </MenuItem>
          );
        })}
      </MenuPopup>
    </Menu>
  );
}
