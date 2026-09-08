"use client";
import type { DataTable } from "@automator/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccessToken } from "../auth/access-token";
import { listDataTablesRequest } from "./client";

export interface DataTablesState {
  tables: readonly DataTable[];
  loading: boolean;
  /** A message to show beside the picker; the table list is empty whenever it is set. */
  error: string | null;
  refresh: () => Promise<void>;
}

const noTables: readonly DataTable[] = [];
const DataTablesContext = createContext<DataTablesState | null>(null);

/** Loads the account's tables once and shares them with every table picker below it. */
export function DataTablesProvider({ children }: { children: ReactNode }) {
  const getAccessToken = useAccessToken();
  const lifetime = useRef<AbortController | null>(null);
  const [tables, setTables] = useState(noTables);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const next = await listDataTablesRequest(await getAccessToken());
        if (signal.aborted) return;
        setTables(next);
        setError(null);
      } catch {
        // An empty picker is a better failure here than a builder panel that stops rendering.
        if (signal.aborted) return;
        setTables(noTables);
        setError("Your tables could not be loaded.");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [getAccessToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    // Deferred behind an await so the effect sets no state during its synchronous pass.
    void (async () => {
      await load(controller.signal);
    })();
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load(lifetime.current?.signal ?? new AbortController().signal);
  }, [load]);

  const value = useMemo(
    () => ({ tables, loading, error, refresh }),
    [tables, loading, error, refresh],
  );
  return <DataTablesContext.Provider value={value}>{children}</DataTablesContext.Provider>;
}

const withoutProvider: DataTablesState = {
  tables: noTables,
  loading: false,
  error: null,
  refresh: async () => {},
};

/**
 * The account's tables. Outside a `DataTablesProvider` this reports an empty, settled list rather
 * than throwing, so a config field can render on its own — mount the provider to fill it.
 */
export function useDataTables(): DataTablesState {
  return useContext(DataTablesContext) ?? withoutProvider;
}
