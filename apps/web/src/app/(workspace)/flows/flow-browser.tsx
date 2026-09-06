"use client";

import { Button } from "@automator/ui/button";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { Input } from "@automator/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@automator/ui/menu";
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "@automator/ui/segmented-control";
import {
  RiAddLine,
  RiArrowDownSLine,
  RiFlowChart,
  RiLayoutGridLine,
  RiListCheck,
  RiSearchLine,
} from "@remixicon/react";
import Link from "next/link";
import { useState } from "react";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import { FlowExamples } from "./flow-examples";
import styles from "./flows.module.css";

// Presentation data only; map the API response here when flow persistence is implemented.
export type FlowListItem = {
  id: string;
  href: string;
  name: string;
  description: string;
  status: "Draft" | "Published";
  updatedAt: string;
  steps: readonly string[];
};
export type FlowView = "grid" | "table";

const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function FlowPreview({ steps, compact = false }: { steps: readonly string[]; compact?: boolean }) {
  return (
    <div className={`${styles.flowPreview} ${compact ? styles.thumbnail : ""}`} aria-hidden="true">
      <div className={styles.previewCanvas}>
        {steps.length ? (
          steps.slice(0, 3).map((step, index) => (
            <span className={styles.previewStep} key={`${index}-${step}`}>
              <RiFlowChart className="size-4 text-muted-foreground" />
              {step}
            </span>
          ))
        ) : (
          <RiFlowChart className="size-7 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}

export function FlowBrowser({
  flows,
  initialView = "grid",
}: {
  flows: readonly FlowListItem[];
  initialView?: FlowView;
}) {
  const [view, setView] = useState(initialView);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"updated" | "name">("updated");
  const visibleFlows = flows
    .filter((flow) => flow.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );

  function changeView(next: FlowView) {
    setView(next);
    document.cookie = `flows_view=${next}; path=/; max-age=31536000; SameSite=Lax`;
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
                Create flow
              </Button>
              <Button variant="outline" render={<Link href="/marketplace" />}>
                Browse marketplace
              </Button>
            </div>
          </section>
          <FlowExamples />
        </>
      ) : (
        <section aria-label="Your flows" className={styles.collection}>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <RiSearchLine aria-hidden="true" />
              <Input
                type="search"
                aria-label="Search flows"
                placeholder="Search flows…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="[&_input]:ps-9"
              />
            </div>
            <div className={styles.toolbarActions}>
              <Menu>
                <MenuTrigger render={<Button variant="outline" />}>
                  {sort === "updated" ? "Last edited" : "Name A–Z"}
                  <RiArrowDownSLine aria-hidden="true" />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem onClick={() => setSort("updated")}>Last edited</MenuItem>
                  <MenuItem onClick={() => setSort("name")}>Name A–Z</MenuItem>
                </MenuPopup>
              </Menu>
              <div role="group" aria-label="Flow view" className={segmentedControlRootClassName}>
                <Button
                  variant="ghost"
                  className={`${segmentedControlItemVariants({ state: "pressed" })} w-8 px-0`}
                  data-pressed={view === "grid" ? "" : undefined}
                  aria-label="Grid view"
                  title="Grid view"
                  aria-pressed={view === "grid"}
                  onClick={() => changeView("grid")}
                >
                  <RiLayoutGridLine aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  className={`${segmentedControlItemVariants({ state: "pressed" })} w-8 px-0`}
                  data-pressed={view === "table" ? "" : undefined}
                  aria-label="Table view"
                  title="Table view"
                  aria-pressed={view === "table"}
                  onClick={() => changeView("table")}
                >
                  <RiListCheck aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
          <p className="sr-only" role="status">
            {visibleFlows.length} flows found
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
                  <Link href={flow.href} className={styles.flowCard}>
                    <FlowPreview steps={flow.steps} />
                    <div className={styles.flowDetails}>
                      <div className="min-w-0">
                        <h2 className="truncate text-label" title={flow.name}>
                          {flow.name}
                        </h2>
                        <div className={styles.flowMeta}>
                          <span
                            className={styles.status}
                            data-published={flow.status === "Published"}
                          >
                            {flow.status}
                          </span>
                          <span aria-hidden="true">·</span>
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
            <div className={styles.tableWrap} role="region" aria-label="Flows table" tabIndex={0}>
              <table className={styles.table}>
                <caption className="sr-only">
                  Your flows, sorted by {sort === "updated" ? "last edited" : "name"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last edited</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFlows.map((flow) => (
                    <tr key={flow.id}>
                      <th scope="row">
                        <Link href={flow.href} className={styles.tableFlow}>
                          <FlowPreview steps={flow.steps} compact />
                          <div className="min-w-0">
                            <span className={styles.flowName}>{flow.name}</span>
                            <p className="mt-1 text-caption font-normal text-muted-foreground">
                              {flow.description}
                            </p>
                          </div>
                        </Link>
                      </th>
                      <td>
                        <span
                          className={styles.status}
                          data-published={flow.status === "Published"}
                        >
                          {flow.status}
                        </span>
                      </td>
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
