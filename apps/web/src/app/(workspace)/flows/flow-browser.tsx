"use client";

import type { FlowSummary } from "@automator/contracts";
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { Input } from "@automator/ui/input";
import {
  Menu,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@automator/ui/menu";
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "@automator/ui/segmented-control";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiAddLine,
  RiArrowDownSLine,
  RiFlowChart,
  RiLayoutGridLine,
  RiListCheck,
  RiMoreLine,
  RiSearchLine,
} from "@remixicon/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { EmptyState } from "../../../components/empty-state";
import { LocalDate } from "../../../components/local-date";
import { PageFrame } from "../../../components/page-frame";
import { FlowActionButton } from "../../../flows/action-button";
import { createFlowAction } from "../../../flows/actions";
import { FlowMiniature } from "../../../flows/flow-miniature";
import { LastRun } from "../../../flows/last-run";
import { FLOWS_VIEW_COOKIE, setPreferenceCookie } from "../../../lib/preferences";
import { DeleteFlowDialog } from "./delete-flow-dialog";
import { FlowStartOptions } from "./flow-start-options";
import styles from "./flows.module.css";

export type FlowView = "grid" | "table";
type FlowSort = "updated" | "name";

const sortLabels: Record<FlowSort, string> = { updated: "Last edited", name: "Name A–Z" };

/**
 * What starts the flow, as a sentence. One trigger says its own detail ("Every 1h", "When
 * ETH / USD is below 2,000"); several are only counted, because no card fits them all.
 */
function triggerLine(flow: FlowSummary): string {
  const [first, ...rest] = flow.triggers;
  if (!first) return "No trigger";
  if (rest.length > 0) return `${flow.triggers.length} triggers`;
  return first.summary.charAt(0).toUpperCase() + first.summary.slice(1);
}

/** Whether the saved flow may start runs on its own — the first thing to know about it. */
function FlowState({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant={enabled ? "success" : "secondary"} size="sm">
      {enabled ? "Active" : "Inactive"}
    </Badge>
  );
}

/** Everything reachable for one flow, so hover offers more than the destructive action. */
function FlowMenu({ flow }: { flow: FlowSummary }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${flow.name}`} />}
        >
          <RiMoreLine aria-hidden="true" />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuLinkItem render={<Link href={`/flows/${flow.id}`} />}>Open on canvas</MenuLinkItem>
          <MenuLinkItem render={<Link href={`/runs?flow=${encodeURIComponent(flow.id)}`} />}>
            View runs
          </MenuLinkItem>
          <MenuSeparator />
          <MenuItem variant="destructive" onClick={() => setDeleting(true)}>
            Delete flow
          </MenuItem>
        </MenuPopup>
      </Menu>
      {/* Outside the popup: the menu closes on that click and would unmount the dialog with it. */}
      <DeleteFlowDialog id={flow.id} name={flow.name} open={deleting} onOpenChange={setDeleting} />
    </>
  );
}

function ViewButton({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            className={`${segmentedControlItemVariants({ size: "sm", state: "pressed" })} w-7 px-0`}
            data-pressed={pressed ? "" : undefined}
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
          >
            {icon}
          </Button>
        }
      />
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * A card carries the flow's own shape, drawn from its stored node positions, then the facts
 * a list is scanned for: what it is called, what starts it, and how it last ended.
 */
function FlowCard({ flow }: { flow: FlowSummary }) {
  return (
    <li className={styles.flowCard}>
      <div className={styles.cardShape}>
        {flow.nodeCount === 0 ? (
          <p className={styles.cardShapeEmpty}>Empty canvas</p>
        ) : (
          <FlowMiniature outline={flow.outline} label={`${flow.name}, ${flow.nodeCount} nodes`} />
        )}
        <span className={styles.cardState}>
          <FlowState enabled={flow.enabled} />
        </span>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardHeading}>
          {/* The link covers the card through ::after, so the menu above stays clickable. */}
          <h2 className={styles.cardName}>
            <Link href={`/flows/${flow.id}`} className={styles.cardLink}>
              {flow.name}
            </Link>
          </h2>
          <div className={styles.cardActions}>
            <FlowMenu flow={flow} />
          </div>
        </div>
        <p className={styles.cardTrigger}>{triggerLine(flow)}</p>
        <p className={styles.cardRun}>
          <LastRun run={flow.lastRun} />
        </p>
      </div>
    </li>
  );
}

export function FlowBrowser({
  flows,
  initialView = "grid",
  examples,
}: {
  flows: readonly FlowSummary[];
  initialView?: FlowView;
  examples?: ReactNode;
}) {
  const [view, setView] = useState(initialView);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<FlowSort>("updated");
  const visibleFlows = flows
    .filter((flow) => flow.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );

  function changeView(next: FlowView) {
    setView(next);
    setPreferenceCookie(FLOWS_VIEW_COOKIE, next);
  }

  const newFlow = (
    <FlowActionButton size="sm" action={createFlowAction.bind(null, {})}>
      <RiAddLine aria-hidden="true" />
      New flow
    </FlowActionButton>
  );

  if (flows.length === 0) {
    return (
      <PageFrame title="Flows" actions={newFlow}>
        <EmptyState
          variant="hero"
          icon={<RiFlowChart />}
          titleId="flows-empty-title"
          title="Create your first flow"
          text="A flow starts with a trigger, runs through logic, AI and onchain steps, and can ship as a mini-app. Pick how you want to begin."
        >
          <FlowStartOptions />
          <p className="mt-6 text-caption text-muted-foreground">
            Or{" "}
            <Link
              href="/marketplace"
              className="text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              browse the marketplace
            </Link>{" "}
            for flows other builders published.
          </p>
        </EmptyState>
        {examples}
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="Flows"
      actions={
        <>
          <div className={styles.search}>
            <RiSearchLine aria-hidden="true" />
            <Input
              unstyled
              type="search"
              aria-label="Search flows"
              placeholder="Search flows…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 [&_input]:h-7 [&_input]:px-0 [&_input]:leading-7"
            />
          </div>
          {newFlow}
        </>
      }
      toolbar={
        <>
          <Menu>
            <MenuTrigger render={<Button variant="outline" size="sm" />}>
              {sortLabels[sort]}
              <RiArrowDownSLine aria-hidden="true" />
            </MenuTrigger>
            <MenuPopup align="start">
              <MenuRadioGroup
                value={sort}
                onValueChange={(next) => setSort(next as FlowSort)}
                aria-label="Sort flows"
              >
                <MenuRadioItem value="updated">{sortLabels.updated}</MenuRadioItem>
                <MenuRadioItem value="name">{sortLabels.name}</MenuRadioItem>
              </MenuRadioGroup>
            </MenuPopup>
          </Menu>
          <p className="sr-only" role="status">
            {visibleFlows.length === 1 ? "1 flow found" : `${visibleFlows.length} flows found`}
          </p>
          <div
            role="group"
            aria-label="Flow view"
            className={`${segmentedControlRootClassName} ms-auto`}
          >
            <ViewButton
              label="Grid view"
              icon={<RiLayoutGridLine aria-hidden="true" />}
              pressed={view === "grid"}
              onClick={() => changeView("grid")}
            />
            <ViewButton
              label="Table view"
              icon={<RiListCheck aria-hidden="true" />}
              pressed={view === "table"}
              onClick={() => changeView("table")}
            />
          </div>
        </>
      }
    >
      {visibleFlows.length === 0 ? (
        <EmptyState
          icon={<RiSearchLine />}
          title="No matching flows"
          text="Try another name, or clear your search."
          action={
            <Button variant="outline" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
        />
      ) : view === "grid" ? (
        <ul className={styles.flowGrid} aria-label="Your flows">
          {visibleFlows.map((flow) => (
            <FlowCard key={flow.id} flow={flow} />
          ))}
        </ul>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Your flows, sorted by {sortLabels[sort]}</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Trigger</th>
                <th scope="col">Last run</th>
                <th scope="col">Edited</th>
                <th scope="col" className={styles.numeric}>
                  Nodes
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleFlows.map((flow) => (
                <tr key={flow.id}>
                  <th scope="row" aria-label={flow.name}>
                    <Link href={`/flows/${flow.id}`} className={styles.tableFlow}>
                      <span className={styles.tableShape}>
                        {flow.nodeCount > 0 && <FlowMiniature outline={flow.outline} />}
                      </span>
                      <span className={styles.flowName}>{flow.name}</span>
                    </Link>
                    <span className={styles.tableState}>
                      <FlowState enabled={flow.enabled} />
                    </span>
                  </th>
                  <td className={styles.tableTrigger}>{triggerLine(flow)}</td>
                  <td>
                    <LastRun run={flow.lastRun} />
                  </td>
                  <td className={styles.tableEdited}>
                    <LocalDate value={flow.updatedAt} />
                  </td>
                  <td className={styles.numeric}>{flow.nodeCount}</td>
                  <td className={styles.tableActions}>
                    <span className={styles.rowActions}>
                      <FlowMenu flow={flow} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageFrame>
  );
}
