"use client";

import type { FlowSummary } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { Input } from "@automator/ui/input";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@automator/ui/menu";
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
  RiSearchLine,
} from "@remixicon/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import { FLOWS_VIEW_COOKIE, setPreferenceCookie } from "../../../lib/preferences";
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

/** A flow summary carries no graph yet, so the preview is a placeholder mark. */
function FlowPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.flowPreview} ${compact ? styles.thumbnail : ""}`} aria-hidden="true">
      <div className={styles.previewCanvas}>
        <RiFlowChart className={`${compact ? "size-5" : "size-7"} text-muted-foreground`} />
      </div>
    </div>
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
  /** Server-rendered example gallery, shown next to the empty state. */
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
          <Button render={<Link href="/create" />}>
            <RiAddLine aria-hidden="true" />
            New flow
          </Button>
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
              Start with a blank canvas, or make one of the examples below your own.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button render={<Link href="/create" />}>
                <RiAddLine aria-hidden="true" />
                New flow
              </Button>
              <Button variant="outline" render={<Link href="/marketplace" />}>
                Browse marketplace
              </Button>
            </div>
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
                <li key={flow.id}>
                  <Link href={`/flows/${flow.id}`} className={styles.flowCard}>
                    <FlowPreview />
                    <div className={styles.flowDetails}>
                      <div className="min-w-0">
                        <h2 className="line-clamp-2 text-label wrap-anywhere">{flow.name}</h2>
                        <div className={styles.flowMeta}>
                          <time dateTime={flow.updatedAt}>
                            {dateFormat.format(new Date(flow.updatedAt))}
                          </time>
                        </div>
                      </div>
                    </div>
                  </Link>
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
                    <th scope="col">Last edited</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFlows.map((flow) => (
                    <tr key={flow.id}>
                      <th scope="row">
                        <Link href={`/flows/${flow.id}`} className={styles.tableFlow}>
                          <FlowPreview compact />
                          <div className="min-w-0">
                            <span className={styles.flowName}>{flow.name}</span>
                            <p className="mt-1 line-clamp-2 text-caption font-normal text-muted-foreground">
                              {flow.description}
                            </p>
                          </div>
                        </Link>
                      </th>
                      <td>
                        <time dateTime={flow.updatedAt}>
                          {dateFormat.format(new Date(flow.updatedAt))}
                        </time>
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
