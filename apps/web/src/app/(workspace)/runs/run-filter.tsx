"use client";

import { flowRunStatuses, type FlowRunStatus, type FlowSummary } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@automator/ui/select";
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "@automator/ui/segmented-control";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { runStatusLabels } from "./run-labels";
import styles from "./runs.module.css";

const allFlows = "";

/* Every filter lives in the URL, so a filtered list can be linked, bookmarked and navigated back to. */
function href(flowId: string, status: FlowRunStatus | undefined): string {
  const params = new URLSearchParams();
  if (flowId) params.set("flow", flowId);
  if (status) params.set("status", status);
  const query = params.toString();
  return query ? `/runs?${query}` : "/runs";
}

export function RunFilter({
  flows,
  selected,
  status,
}: {
  flows: readonly FlowSummary[];
  selected: string;
  status?: FlowRunStatus;
}) {
  const router = useRouter();
  const unavailable = selected !== "" && !flows.some((flow) => flow.id === selected);
  const items = [
    { value: allFlows, label: "All flows" },
    ...(unavailable ? [{ value: selected, label: "Unavailable flow" }] : []),
    ...flows.map((flow) => ({ value: flow.id, label: flow.name })),
  ];
  const value = selected || allFlows;
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarGroup}>
        <label htmlFor="run-filter-flow" className="text-caption text-muted-foreground">
          Flow
        </label>
        <Select
          items={items}
          value={value}
          onValueChange={(next) => {
            if (typeof next !== "string") return;
            router.push(href(next, status));
          }}
        >
          <SelectTrigger id="run-filter-flow" size="sm" className="min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {items.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                disabled={unavailable && item.value === selected}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      <nav aria-label="Filter runs by status" className={segmentedControlRootClassName}>
        <Button
          variant="ghost"
          size="sm"
          className={segmentedControlItemVariants({ size: "sm", state: "current" })}
          aria-current={status === undefined ? "page" : undefined}
          render={<Link href={href(selected, undefined)} scroll={false} />}
        >
          All
        </Button>
        {flowRunStatuses.map((value) => (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            className={segmentedControlItemVariants({ size: "sm", state: "current" })}
            aria-current={status === value ? "page" : undefined}
            render={<Link href={href(selected, value)} scroll={false} />}
          >
            {runStatusLabels[value].label}
          </Button>
        ))}
      </nav>
    </div>
  );
}
