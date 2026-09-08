"use client";

import type { NodePreset, NodePresetInput } from "@automator/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createNodePresetRequest,
  deleteNodePresetRequest,
  listNodePresetsRequest,
} from "./presets-client";
import { useAccessToken } from "../auth/access-token";

export interface NodePresetsState {
  presets: readonly NodePreset[];
  loading: boolean;
  save(input: NodePresetInput): Promise<NodePreset>;
  remove(id: string): Promise<void>;
}

const noPresets: readonly NodePreset[] = [];
const NodePresetsContext = createContext<NodePresetsState | null>(null);

/** Loads the account's saved nodes once and shares them with the palette and node settings. */
export function NodePresetsProvider({ children }: { children: ReactNode }) {
  const getAccessToken = useAccessToken();
  const [presets, setPresets] = useState(noPresets);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const next = await listNodePresetsRequest(await getAccessToken());
        if (!controller.signal.aborted) setPresets(next);
      } catch {
        // An empty section is a better failure here than a builder panel that stops rendering.
        if (!controller.signal.aborted) setPresets(noPresets);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [getAccessToken]);

  const save = useCallback(
    async (input: NodePresetInput) => {
      const saved = await createNodePresetRequest(await getAccessToken(), input);
      setPresets((current) => [saved, ...current]);
      return saved;
    },
    [getAccessToken],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteNodePresetRequest(id, await getAccessToken());
      setPresets((current) => current.filter((preset) => preset.id !== id));
    },
    [getAccessToken],
  );

  const value = useMemo(
    () => ({ presets, loading, save, remove }),
    [presets, loading, save, remove],
  );
  return <NodePresetsContext.Provider value={value}>{children}</NodePresetsContext.Provider>;
}

const withoutProvider: NodePresetsState = {
  presets: noPresets,
  loading: false,
  save: async () => {
    throw new Error("Saved nodes need a NodePresetsProvider");
  },
  remove: async () => {},
};

/**
 * The account's saved nodes. Outside a provider this reports an empty, settled list rather than
 * throwing, so a panel can render on its own.
 */
export function useNodePresets(): NodePresetsState {
  return useContext(NodePresetsContext) ?? withoutProvider;
}
