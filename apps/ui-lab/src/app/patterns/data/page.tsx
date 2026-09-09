import { Button } from "@automator/ui/button";
import {
  RiAddLine,
  RiAppsLine,
  RiArrowDownSLine,
  RiCalendarLine,
  RiCheckboxLine,
  RiCloseLine,
  RiCompass3Line,
  RiFlowChart,
  RiHashtag,
  RiHome5Line,
  RiListCheck2,
  RiMoreLine,
  RiPlayCircleLine,
  RiPlugLine,
  RiSearchLine,
  RiSettings3Line,
  RiTableLine,
  RiText,
  RiWallet3Line,
} from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Data (redesign)" };

/**
 * Throwaway comparison for the workspace redesign: three shells for the Data section,
 * drawn with the real tokens over the same fixtures. The workspace sidebar is shown as the
 * 52 px rail in every one, so the comparison is about the Data surface alone.
 * Delete once the section lands.
 */

type ColumnType = "text" | "number" | "checkbox" | "datetime" | "select" | "address";

const typeIcons: Record<ColumnType, RemixiconComponentType> = {
  text: RiText,
  number: RiHashtag,
  checkbox: RiCheckboxLine,
  datetime: RiCalendarLine,
  select: RiListCheck2,
  address: RiWallet3Line,
};

type Column = { name: string; type: ColumnType };
type Table = {
  name: string;
  description: string;
  records: number;
  updated: string;
  columns: Column[];
  rows: string[][];
};

const tables: Table[] = [
  {
    name: "Signups",
    description: "Everyone who joined through the waitlist mini-app.",
    records: 42,
    updated: "Sep 9",
    columns: [
      { name: "Email", type: "text" },
      { name: "Plan", type: "select" },
      { name: "Wallet", type: "address" },
      { name: "Joined", type: "datetime" },
      { name: "Verified", type: "checkbox" },
    ],
    rows: [
      ["ada@lovelace.dev", "Pro", "0x71c7…f2e9", "9 Sep, 14:02", "Yes"],
      ["grace@hopper.io", "Free", "0x9a3b…10c4", "9 Sep, 11:40", "Yes"],
      ["alan@turing.uk", "Pro", "0x4de1…88fa", "8 Sep, 18:25", "No"],
      ["katherine@nasa.gov", "Team", "0x2f80…b7d3", "8 Sep, 09:12", "Yes"],
      ["linus@kernel.org", "Free", "0xcc57…4e21", "7 Sep, 22:58", "No"],
      ["barbara@liskov.mit", "Pro", "0x18ae…9b60", "7 Sep, 16:31", "Yes"],
    ],
  },
  {
    name: "Watchlist",
    description: "Price levels the watch trigger reads every minute.",
    records: 7,
    updated: "Sep 8",
    columns: [
      { name: "Token", type: "text" },
      { name: "Threshold", type: "number" },
      { name: "Direction", type: "select" },
    ],
    rows: [
      ["ETH/USD", "2,000", "Below"],
      ["BTC/USD", "58,000", "Below"],
      ["LINK/USD", "12", "Above"],
    ],
  },
  {
    name: "Payouts",
    description: "Every transfer the treasury flow has sent.",
    records: 128,
    updated: "Sep 6",
    columns: [
      { name: "Recipient", type: "address" },
      { name: "Amount", type: "number" },
      { name: "Memo", type: "text" },
      { name: "Sent", type: "datetime" },
      { name: "Settled", type: "checkbox" },
    ],
    rows: [
      ["0x71c7…f2e9", "250.00", "September retainer", "6 Sep, 10:00", "Yes"],
      ["0x9a3b…10c4", "80.00", "Bounty #14", "6 Sep, 10:00", "Yes"],
      ["0x4de1…88fa", "1,200.00", "Audit milestone", "5 Sep, 17:45", "No"],
    ],
  },
];

const signups = tables[0] as Table;

/* ---------------------------------------------------------------- shared */

const railItems: { icon: RemixiconComponentType; active?: boolean }[] = [
  { icon: RiHome5Line },
  { icon: RiFlowChart },
  { icon: RiPlayCircleLine },
  { icon: RiTableLine, active: true },
  { icon: RiPlugLine },
  { icon: RiWallet3Line },
  { icon: RiAppsLine },
  { icon: RiCompass3Line },
];

/** The workspace sidebar collapsed, so every mock spends its width on the Data surface. */
function WorkspaceRail() {
  return (
    <div className="flex w-13 shrink-0 flex-col bg-sidebar">
      <div className="flex h-12 items-center pl-4">
        <span className="size-5 rounded-sm bg-foreground/80" aria-hidden="true" />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-2">
        {railItems.map((item, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative rail
            key={index}
            className={`flex h-7.5 items-center rounded-sm px-2.5 ${item.active ? "bg-accent text-foreground" : "text-muted-foreground"}`}
          >
            <item.icon aria-hidden="true" className="size-4 shrink-0" />
          </span>
        ))}
      </nav>
      <div className="border-border border-t px-2 py-2">
        <span className="flex h-7.5 items-center rounded-sm px-2.5 text-muted-foreground">
          <RiSettings3Line aria-hidden="true" className="size-4" />
        </span>
      </div>
    </div>
  );
}

function Frame({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-label">{label}</h2>
      <p className="max-w-3xl text-caption text-muted-foreground text-pretty">{note}</p>
      <div className="mt-1 h-[520px] overflow-hidden rounded-md border border-border">
        <div className="flex h-full">{children}</div>
      </div>
    </section>
  );
}

/** The 48 px title bar and 44 px toolbar of the page frame, so every mock keeps the same head. */
function TitleBar({ children }: { children: React.ReactNode }) {
  return <div className="flex h-12 shrink-0 items-center gap-3 px-6">{children}</div>;
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex h-11 shrink-0 items-center gap-2 px-6">{children}</div>;
}

function SearchBox({ placeholder }: { placeholder: string }) {
  return (
    <span className="flex h-7.5 w-56 items-center gap-2 rounded-lg border border-input px-2.5 text-[12px] text-muted-foreground">
      <RiSearchLine aria-hidden="true" className="size-4 shrink-0" />
      {placeholder}
    </span>
  );
}

function ColumnHead({ column }: { column: Column }) {
  const Icon = typeIcons[column.type];
  return (
    <th
      scope="col"
      className="border-border border-b px-3 py-2 text-start font-normal whitespace-nowrap text-muted-foreground"
    >
      <span className="flex items-center gap-1.5">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
        {column.name}
      </span>
    </th>
  );
}

/** The record grid: one row height, one rule, values styled by their column's type. */
function RecordGrid({ table, selected }: { table: Table; selected?: number }) {
  return (
    <table className="w-full border-collapse text-[12px] leading-5">
      <thead>
        <tr>
          <th scope="col" className="w-8 border-border border-b px-3 py-2">
            <span className="sr-only">Row</span>
          </th>
          {table.columns.map((column) => (
            <ColumnHead key={column.name} column={column} />
          ))}
          <th scope="col" className="border-border border-b px-3 py-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, rowIndex) => (
          <tr
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed fixture rows
            key={rowIndex}
            className={selected === rowIndex ? "bg-accent" : undefined}
          >
            <td className="border-border border-b px-3 py-1.5 text-[11px] text-muted-foreground tabular-nums">
              {rowIndex + 1}
            </td>
            {row.map((value, cellIndex) => {
              const column = table.columns[cellIndex] as Column;
              return (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed fixture cells
                  key={cellIndex}
                  className="max-w-56 truncate border-border border-b px-3 py-1.5 whitespace-nowrap"
                >
                  {column.type === "select" ? (
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">{value}</span>
                  ) : column.type === "address" ? (
                    <code className="text-[11px] text-muted-foreground">{value}</code>
                  ) : column.type === "number" ? (
                    <span className="tabular-nums">{value}</span>
                  ) : column.type === "checkbox" ? (
                    <span className="text-muted-foreground">{value}</span>
                  ) : (
                    value
                  )}
                </td>
              );
            })}
            <td className="border-border border-b px-3 py-1.5 text-end">
              <RiMoreLine aria-hidden="true" className="ml-auto size-3.5 text-muted-foreground" />
            </td>
          </tr>
        ))}
        <tr>
          <td
            colSpan={table.columns.length + 2}
            className="px-3 py-1.5 text-[12px] text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <RiAddLine aria-hidden="true" className="size-3.5" />
              New record
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* -------------------------------------------------- A: table rail + grid */

function TableRail() {
  return (
    <div className="flex w-46 shrink-0 flex-col border-border border-r bg-card">
      <div className="flex h-12 shrink-0 items-center px-3">
        <span className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
          Tables
        </span>
        <span className="ml-auto text-muted-foreground">
          <RiAddLine aria-hidden="true" className="size-4" />
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-2">
        {tables.map((table, index) => (
          <span
            key={table.name}
            className={`flex h-7.5 items-center gap-2 rounded-sm px-2 text-[13px] ${index === 0 ? "bg-accent text-foreground" : "text-muted-foreground"}`}
          >
            <RiTableLine aria-hidden="true" className="size-4 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate">{table.name}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">{table.records}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function RecordPanel() {
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-border border-l bg-card">
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-label">ada@lovelace.dev</p>
          <p className="text-[11px] text-muted-foreground">Record 1 of 42</p>
        </div>
        <RiCloseLine aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-3 px-4 pt-2">
        {signups.columns.map((column, index) => {
          const Icon = typeIcons[column.type];
          return (
            <div key={column.name} className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Icon aria-hidden="true" className="size-3.5 opacity-70" />
                {column.name}
              </span>
              <span className="rounded-sm border border-input px-2 py-1 text-[12px]">
                {(signups.rows[0] as string[])[index]}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function VariantA({ panel }: { panel?: boolean }) {
  return (
    <>
      <WorkspaceRail />
      <TableRail />
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <TitleBar>
          <h3 className="text-panel">Signups</h3>
          <span className="text-caption text-muted-foreground">42 records</span>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox placeholder="Search records…" />
            <Button size="xs" variant="outline">
              Columns
            </Button>
            <Button size="xs">
              <RiAddLine aria-hidden="true" />
              Add record
            </Button>
          </div>
        </TitleBar>
        <Toolbar>
          <Button size="xs" variant="outline">
            <RiListCheck2 aria-hidden="true" />
            Filter
          </Button>
          <Button size="xs" variant="outline">
            Sort
            <RiArrowDownSLine aria-hidden="true" />
          </Button>
        </Toolbar>
        <div className="min-h-0 flex-1 overflow-hidden px-6">
          <RecordGrid table={signups} selected={panel ? 0 : undefined} />
        </div>
      </div>
      {panel && <RecordPanel />}
    </>
  );
}

/* ------------------------------------------- B: index cards + dense grid */

function SchemaStrip({ table }: { table: Table }) {
  return (
    <div className="flex flex-col">
      {table.columns.slice(0, 4).map((column) => {
        const Icon = typeIcons[column.type];
        return (
          <span
            key={column.name}
            className="flex items-center gap-2 border-border border-b px-3 py-1.5 text-[11px] text-muted-foreground last:border-b-0"
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate">{column.name}</span>
            <span className="opacity-70">{column.type}</span>
          </span>
        );
      })}
    </div>
  );
}

function VariantBIndex() {
  return (
    <>
      <WorkspaceRail />
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <TitleBar>
          <h3 className="text-panel">Data</h3>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox placeholder="Search tables…" />
            <Button size="xs">
              <RiAddLine aria-hidden="true" />
              New table
            </Button>
          </div>
        </TitleBar>
        <Toolbar>
          <Button size="xs" variant="outline">
            Last edited
            <RiArrowDownSLine aria-hidden="true" />
          </Button>
        </Toolbar>
        <div className="grid grid-cols-3 content-start gap-4 px-6 pt-1">
          {tables.map((table) => (
            <div
              key={table.name}
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
            >
              {/* The card leads with the table's own schema — the Data answer to the flow shape. */}
              <SchemaStrip table={table} />
              <div className="flex flex-col gap-1 border-border border-t px-3 py-2.5">
                <p className="truncate text-label">{table.name}</p>
                <p className="line-clamp-2 text-[11px] text-muted-foreground text-pretty">
                  {table.description}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                  {table.records} records · {table.columns.length} columns · {table.updated}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function VariantBDetail() {
  return (
    <>
      <WorkspaceRail />
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <TitleBar>
          <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
            Data
            <RiArrowDownSLine aria-hidden="true" className="size-3.5 -rotate-90" />
          </span>
          {/* The switcher replaces the trip back to the index. */}
          <span className="flex items-center gap-1.5 text-panel">
            Signups
            <RiArrowDownSLine aria-hidden="true" className="size-4 text-muted-foreground" />
          </span>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox placeholder="Search records…" />
            <Button size="xs" variant="outline">
              Edit columns
            </Button>
            <Button size="xs">
              <RiAddLine aria-hidden="true" />
              Add record
            </Button>
          </div>
        </TitleBar>
        <Toolbar>
          <Button size="xs" variant="outline">
            <RiListCheck2 aria-hidden="true" />
            Filter
          </Button>
          <Button size="xs" variant="outline">
            Sort
            <RiArrowDownSLine aria-hidden="true" />
          </Button>
          <span className="ml-auto text-caption text-muted-foreground tabular-nums">
            42 records
          </span>
        </Toolbar>
        <div className="min-h-0 flex-1 overflow-hidden px-6">
          <RecordGrid table={signups} />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------- C: table tabs */

function VariantC() {
  return (
    <>
      <WorkspaceRail />
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <TitleBar>
          <h3 className="text-panel">Data</h3>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox placeholder="Search records…" />
            <Button size="xs" variant="outline">
              Edit columns
            </Button>
            <Button size="xs">
              <RiAddLine aria-hidden="true" />
              Add record
            </Button>
          </div>
        </TitleBar>
        <div className="flex h-11 shrink-0 items-center gap-1 border-border border-b px-6">
          {tables.map((table, index) => (
            <span
              key={table.name}
              className={`flex h-7.5 items-center gap-2 rounded-sm px-2.5 text-[12px] ${index === 0 ? "bg-accent text-foreground" : "text-muted-foreground"}`}
            >
              {table.name}
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {table.records}
              </span>
            </span>
          ))}
          <span className="flex size-7 items-center justify-center text-muted-foreground">
            <RiAddLine aria-hidden="true" className="size-4" />
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-6 pt-1">
          <RecordGrid table={signups} />
        </div>
      </div>
    </>
  );
}

export default function DataPatternPage() {
  return (
    <>
      <h1 className="mb-2 text-section">Data (redesign)</h1>
      <p className="mb-10 max-w-3xl text-body text-muted-foreground text-pretty">
        Three shells for the Data section over the same fixtures, drawn with the real tokens. The
        workspace sidebar is the 52 px rail in every one, so the width goes to the surface being
        compared. Set the preview width to <strong className="text-foreground">full</strong>.
        Throwaway — deleted once the section lands.
      </p>
      <div className="flex flex-col gap-12">
        <Frame
          label="A — Table rail + grid"
          note="One working surface: the tables live in a rail on the left, the selected table's records fill the rest. Moving between tables is one click and there is no index page. /data/[tableId] just marks the rail."
        >
          <VariantA />
        </Frame>
        <Frame
          label="A — with the record panel open"
          note="The same shell with a record opened in the shared side panel. This is the width question: workspace rail + table rail + grid + panel. The grid keeps roughly half the frame."
        >
          <VariantA panel />
        </Frame>
        <Frame
          label="B — Index of schema cards"
          note="Today's route structure kept. Each card leads with the table's own columns and their types — the Data answer to the flow-shape miniature on Flows — over the record count and the last edit."
        >
          <VariantBIndex />
        </Frame>
        <Frame
          label="B — Detail with a table switcher"
          note="The detail page of the same variant. The title is a switcher, so moving between tables does not need the trip back to the index."
        >
          <VariantBDetail />
        </Frame>
        <Frame
          label="C — Table tabs"
          note="A single page with the tables as tabs above the grid. Spends the least width, but the tabs overflow as tables are added and there is nowhere to put a description or a record count."
        >
          <VariantC />
        </Frame>
      </div>
    </>
  );
}
