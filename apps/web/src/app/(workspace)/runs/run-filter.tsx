"use client";

import type { FlowSummary } from "@automator/contracts";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@automator/ui/select";
import { useRouter } from "next/navigation";

const allFlows = "__all__";

/** Narrows the run history to one flow through the `flow` query parameter. */
export function RunFilter({
  flows,
  selected,
}: {
  flows: readonly FlowSummary[];
  selected: string;
}) {
  const router = useRouter();
  const items = [
    { value: allFlows, label: "All flows" },
    ...flows.map((flow) => ({ value: flow.id, label: flow.name })),
  ];
  const value = flows.some((flow) => flow.id === selected) ? selected : allFlows;
  return (
    <div className="mb-4 flex items-center gap-3">
      <label htmlFor="run-filter-flow" className="text-caption text-muted-foreground">
        Flow
      </label>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (typeof next !== "string") return;
          router.push(next === allFlows ? "/runs" : `/runs?flow=${encodeURIComponent(next)}`);
        }}
      >
        <SelectTrigger id="run-filter-flow" size="sm" className="min-w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}
