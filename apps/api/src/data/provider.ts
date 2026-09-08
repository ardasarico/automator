import type { DataRecordStore, DataTableStore } from "@automator/db";
import type { DataMode, DataProvider } from "@automator/flow-engine";

export interface DataFactoryDependencies {
  dataTables: Pick<DataTableStore, "get">;
  dataRecords: Pick<DataRecordStore, "find" | "get" | "create" | "update" | "remove">;
}

export interface DataFactory {
  /** The account's own tables and nothing else; another owner's id resolves to nothing. */
  forOwner(ownerId: string, mode: DataMode): DataProvider;
}

export function createDataFactory({
  dataTables,
  dataRecords,
}: DataFactoryDependencies): DataFactory {
  return {
    forOwner(ownerId, mode) {
      /* The executors already return simulated results instead of writing; this is the
       * second guard, so a new executor cannot write from a simulated run by accident. */
      const writing = (what: string) => {
        if (mode === "dry-run") throw new Error(`A simulated run cannot ${what}`);
      };
      return {
        mode,
        table: (tableId) => dataTables.get(ownerId, tableId),
        find: (tableId, query) => dataRecords.find(ownerId, tableId, query),
        async resolve(tableId, target) {
          if ("recordId" in target) return dataRecords.get(ownerId, tableId, target.recordId);
          const found = await dataRecords.find(ownerId, tableId, { ...target.query, limit: 1 });
          return found[0] ?? null;
        },
        async create(tableId, values) {
          writing("create a record");
          const record = await dataRecords.create(ownerId, tableId, values);
          if (!record) throw new Error(`Table "${tableId}" was not found`);
          return record;
        },
        async update(tableId, recordId, values) {
          writing("change a record");
          const record = await dataRecords.update(ownerId, tableId, recordId, values);
          if (!record) throw new Error(`Record "${recordId}" was not found`);
          return record;
        },
        async remove(tableId, recordId) {
          writing("delete a record");
          return dataRecords.remove(ownerId, tableId, recordId);
        },
      };
    },
  };
}
