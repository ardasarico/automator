"use client";

import type { DataTable } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { Input } from "@automator/ui/input";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@automator/ui/menu";
import { RiAddLine, RiArrowDownSLine, RiSearchLine, RiTableLine } from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import styles from "../flows/flows.module.css";
import { TableDialog } from "./table-dialog";

type TableSort = "updated" | "name";

const sortLabels: Record<TableSort, string> = { updated: "Last edited", name: "Name A–Z" };

const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function DataBrowser({ tables }: { tables: readonly DataTable[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TableSort>("updated");
  const visible = tables
    .filter((table) => table.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );

  return (
    <>
      <header className={styles.header}>
        <WorkspaceBreadcrumbs current="Data" />
        {tables.length > 0 && (
          <div className={styles.headerActions}>
            <Button onClick={() => setCreating(true)}>
              <RiAddLine aria-hidden="true" />
              New table
            </Button>
          </div>
        )}
      </header>
      {tables.length === 0 ? (
        <section className={styles.empty} aria-labelledby="data-empty-title">
          <EmptyStateIllustration icon={<RiTableLine />} />
          <h2 id="data-empty-title" className="mt-6 text-panel text-balance">
            Create your first table
          </h2>
          <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">
            A table holds records with typed columns. Your flows can look them up, add to them and
            change them while they run.
          </p>
          <Button className="mt-6" onClick={() => setCreating(true)}>
            <RiAddLine aria-hidden="true" />
            Create a table
          </Button>
        </section>
      ) : (
        <section aria-label="Your tables" className={styles.collection}>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <RiSearchLine aria-hidden="true" />
              <Input
                unstyled
                type="search"
                aria-label="Search tables"
                placeholder="Search tables…"
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
                    onValueChange={(next) => setSort(next as TableSort)}
                    aria-label="Sort tables"
                  >
                    <MenuRadioItem value="updated">{sortLabels.updated}</MenuRadioItem>
                    <MenuRadioItem value="name">{sortLabels.name}</MenuRadioItem>
                  </MenuRadioGroup>
                </MenuPopup>
              </Menu>
            </div>
          </div>
          <p className="sr-only" role="status">
            {visible.length === 1 ? "1 table found" : `${visible.length} tables found`}
          </p>
          {visible.length === 0 ? (
            <div className={styles.empty}>
              <EmptyStateIllustration icon={<RiSearchLine />} />
              <h2 className="mt-6 text-panel">No matching tables</h2>
              <p className="mt-3 text-body text-muted-foreground">
                Try another name, or clear your search.
              </p>
              <Button variant="outline" className="mt-6" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">Your tables, sorted by {sortLabels[sort]}</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Columns</th>
                    <th scope="col">Records</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((table) => (
                    <tr key={table.id}>
                      <th scope="row">
                        <Link
                          href={`/data/${encodeURIComponent(table.id)}`}
                          className={styles.tableFlow}
                          aria-label={`${table.name} table`}
                        >
                          <span className="min-w-0">
                            <span className={styles.flowName}>{table.name}</span>
                            {table.description && (
                              <span className="mt-1 line-clamp-2 block text-caption font-normal text-muted-foreground">
                                {table.description}
                              </span>
                            )}
                          </span>
                        </Link>
                      </th>
                      <td className="tabular-nums">{table.columns.length}</td>
                      <td className="tabular-nums">{table.recordCount}</td>
                      <td>
                        <time dateTime={table.updatedAt}>
                          {dateFormat.format(new Date(table.updatedAt))}
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
      {creating && (
        <TableDialog
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false);
            router.push(`/data/${encodeURIComponent(saved.id)}`);
          }}
        />
      )}
    </>
  );
}
