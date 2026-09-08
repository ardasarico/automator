import type { ConditionOperator } from "@automator/contracts";

export type DataMode = "dry-run" | "live";

export interface DataColumn {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  options?: readonly string[];
}

export interface DataTable {
  id: string;
  name: string;
  columns: readonly DataColumn[];
}

export interface DataRecord {
  id: string;
  tableId: string;
  values: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DataFilter {
  column: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface DataQuery {
  filters?: readonly DataFilter[];
  sort?: { column: string; direction: "asc" | "desc" };
  limit?: number;
}

/** Addresses one record: by its id, or by the first record a query matches. */
export type DataTarget = { recordId: string } | { query: DataQuery };

/** Owner-bound access to the account's tables. Implementations resolve nothing outside that owner. */
export interface DataProvider {
  mode: DataMode;
  table(tableId: string): Promise<DataTable | null>;
  find(tableId: string, query: DataQuery): Promise<readonly DataRecord[]>;
  resolve(tableId: string, target: DataTarget): Promise<DataRecord | null>;
  create(tableId: string, values: Record<string, unknown>): Promise<DataRecord>;
  update(tableId: string, recordId: string, values: Record<string, unknown>): Promise<DataRecord>;
  remove(tableId: string, recordId: string): Promise<DataRecord | null>;
}
