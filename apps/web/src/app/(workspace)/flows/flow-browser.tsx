"use client";

import type { FlowSummary } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { Input } from "@automator/ui/input";
import { Badge } from "@automator/ui/badge";
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
import { getCatalogEntry } from "../../../builder/catalog";
import { CatalogIconMark } from "../../../builder/catalog-icon";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import { FlowActionButton } from "../../../flows/action-button";
import { createFlowAction } from "../../../flows/actions";
import { FLOWS_VIEW_COOKIE, setPreferenceCookie } from "../../../lib/preferences";
import { DeleteFlowDialog } from "./delete-flow-dialog";
import { FlowStartOptions } from "./flow-start-options";
import styles from "./flows.module.css";

export type FlowView = "grid" | "table";
type FlowSort = "updated" | "name";

const sortLabels: Record<FlowSort, string> = { updated: "Last edited", name: "Name A–Z" };

const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function FlowFacts({ flow }: { flow: FlowSummary }) {
  const triggers = flow.triggerTypes.map((type) => getCatalogEntry(type));
  return (
    <span className={styles.flowFacts}>
      {triggers.length === 0 ? (
        <span>No trigger</span>
      ) : (
        <span className={styles.flowTriggers} title={triggers.map((t) => t.label).join(", ")}>
          {triggers.map((entry) => (
            <CatalogIconMark key={entry.type} icon={entry.icon} label={entry.label} />
          ))}
          <span>{triggers.length === 1 ? triggers[0]!.label : `${triggers.length} triggers`}</span>
        </span>
      )}
      <span aria-hidden="true">·</span>
      <span>{flow.nodeCount === 1 ? "1 node" : `${flow.nodeCount} nodes`}</span>
    </span>
  );
}

/**
 * Whether the saved flow may start runs on its own. It is the first thing to know about a flow
 * and the list never said it, so it leads the card.
 */
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
            className={`${segmentedControlItemVariants({ state: "pressed" })} w-8 px-0`}
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <WorkspaceBreadcrumbs current="Flows" />
        <div className={styles.headerActions}>
          <FlowActionButton action={createFlowAction.bind(null, {})}>
            <RiAddLine aria-hidden="true" />
            New flow
          </FlowActionButton>
        </div>
      </header>
      {flows.length === 0 ? (
        <>
          <section
            className={`${styles.empty} ${styles.emptyHero}`}
            aria-labelledby="flows-empty-title"
          >
            <EmptyStateIllustration icon={<RiFlowChart />} />
            <h2 id="flows-empty-title" className="mt-6 text-panel text-balance">
              Create your first flow
            </h2>
            <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">
              A flow starts with a trigger, runs through logic, AI and onchain steps, and can ship
              as a mini-app. Pick how you want to begin.
            </p>
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
          </section>
          {examples}
        </>
      ) : (
        <section aria-label="Your flows" className={styles.collection}>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <RiSearchLine aria-hidden="true" />
              <Input
                unstyled
                type="search"
                aria-label="Search flows"
                placeholder="Search flows…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 [&_input]:px-0"
              />
            </div>
            <div className={styles.toolbarActions}>
              <Menu>
                <MenuTrigger render={<Button variant="outline" />}>
                  {sortLabels[sort]}
                  <RiArrowDownSLine aria-hidden="true" />
                </MenuTrigger>
                <MenuPopup align="end">
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
              <div role="group" aria-label="Flow view" className={segmentedControlRootClassName}>
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
            </div>
          </div>
          <p className="sr-only" role="status">
            {visibleFlows.length === 1 ? "1 flow found" : `${visibleFlows.length} flows found`}
          </p>
          {visibleFlows.length === 0 ? (
            <div className={styles.empty}>
              <EmptyStateIllustration icon={<RiSearchLine />} />
              <h2 className="mt-6 text-panel">No matching flows</h2>
              <p className="mt-3 text-body text-muted-foreground">
                Try another name, or clear your search.
              </p>
              <Button variant="outline" className="mt-6" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </div>
          ) : view === "grid" ? (
            <ul className={styles.flowGrid}>
              {visibleFlows.map((flow) => (
                <li key={flow.id} className={styles.flowCard}>
                  <div className={styles.cardTop}>
                    <FlowState enabled={flow.enabled} />
                    <div className={styles.cardActions}>
                      <FlowMenu flow={flow} />
                    </div>
                  </div>
                  {/* The link covers the card through ::after, so the menu above stays clickable. */}
                  <h2 className="text-label">
                    <Link href={`/flows/${flow.id}`} className={styles.cardLink}>
                      {flow.name}
                    </Link>
                  </h2>
                  {flow.description && <p className={styles.cardDescription}>{flow.description}</p>}
                  <div className={styles.cardFooter}>
                    <FlowFacts flow={flow} />
                    <time dateTime={flow.updatedAt}>
                      {dateFormat.format(new Date(flow.updatedAt))}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">Your flows, sorted by {sortLabels[sort]}</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">State</th>
                    <th scope="col">Last edited</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFlows.map((flow) => (
                    <tr key={flow.id}>
                      <th scope="row" aria-label={flow.name}>
                        <div className="min-w-0">
                          <Link href={`/flows/${flow.id}`} className={styles.tableFlow}>
                            <span className={styles.flowName}>{flow.name}</span>
                          </Link>
                          <p className="mt-1 line-clamp-2 text-caption font-normal text-muted-foreground">
                            {flow.description}
                          </p>
                          <p className="mt-1 text-caption font-normal text-muted-foreground">
                            <FlowFacts flow={flow} />
                          </p>
                        </div>
                      </th>
                      <td className="w-px">
                        <FlowState enabled={flow.enabled} />
                      </td>
                      <td>
                        <time dateTime={flow.updatedAt}>
                          {dateFormat.format(new Date(flow.updatedAt))}
                        </time>
                      </td>
                      <td className="w-px">
                        <FlowMenu flow={flow} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
