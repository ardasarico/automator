/// <reference types="bun" />
import type { DataTable } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

if (process.env.AUTOMATOR_DATA_TABLES_TEST_CHILD !== import.meta.path) {
  test("the table context caches, degrades and refreshes", async () => {
    // Module mocks are process-wide in Bun; keep them out of the other suites.
    const child = Bun.spawn([process.execPath, "test", import.meta.path], {
      env: { ...process.env, AUTOMATOR_DATA_TABLES_TEST_CHILD: import.meta.path },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ exitCode, output: exitCode === 0 ? "" : stdout + stderr }).toEqual({
      exitCode: 0,
      output: "",
    });
  });
} else {
  GlobalRegistrator.register();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  let tokenProvider = async (): Promise<string | null> => "privy-token";
  const getAccessToken = () => tokenProvider();
  mock.module("../auth/access-token", () => ({ useAccessToken: () => getAccessToken }));

  const tokens: Array<string | null> = [];
  let answer: () => Promise<readonly DataTable[]> = async () => [table("tbl-1", "Signups")];
  mock.module("./client", () => ({
    DataRequestError: class extends Error {},
    listDataTablesRequest: (token: string | null) => {
      tokens.push(token);
      return answer();
    },
  }));

  const { DataTablesProvider, useDataTables } = await import("./tables-context");

  function table(id: string, name: string): DataTable {
    return {
      id,
      name,
      columns: [],
      recordCount: 0,
      createdAt: "2026-09-08T10:00:00.000Z",
      updatedAt: "2026-09-08T10:00:00.000Z",
    };
  }

  function Probe() {
    const { tables, loading, error, refresh } = useDataTables();
    return (
      <div>
        <span>{loading ? "loading" : `names:${tables.map((entry) => entry.name).join(",")}`}</span>
        <span>{error ?? ""}</span>
        <button type="button" onClick={() => void refresh()}>
          refresh
        </button>
      </div>
    );
  }

  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    tokens.length = 0;
    tokenProvider = async () => "privy-token";
    answer = async () => [table("tbl-1", "Signups")];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  afterAll(async () => GlobalRegistrator.unregister());

  const renderProvider = (children = 1) =>
    act(async () =>
      root.render(
        <DataTablesProvider>
          {Array.from({ length: children }, (_value, index) => (
            <Probe key={index} />
          ))}
        </DataTablesProvider>,
      ),
    );

  test("the list is fetched once with the access token and shared by every consumer", async () => {
    await renderProvider(2);
    expect(tokens).toEqual(["privy-token"]);
    expect(container.textContent).toContain("names:Signups");
    expect(container.querySelectorAll("span")[0]?.textContent).toBe("names:Signups");
  });

  test("a failed request settles on an empty list instead of throwing", async () => {
    answer = async () => {
      throw new Error("offline");
    };
    await renderProvider();
    expect(container.textContent).toContain("names:");
    expect(container.textContent).not.toContain("loading");
    expect(container.textContent).toContain("Your tables could not be loaded.");
  });

  test("refresh replaces the cached list and clears the earlier error", async () => {
    answer = async () => {
      throw new Error("offline");
    };
    await renderProvider();
    expect(container.textContent).toContain("Your tables could not be loaded.");

    answer = async () => [table("tbl-2", "Waitlist")];
    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(tokens).toHaveLength(2);
    expect(container.textContent).toContain("names:Waitlist");
    expect(container.textContent).not.toContain("could not be loaded");
  });

  test("a consumer outside the provider reports a settled empty list", async () => {
    await act(async () => root.render(<Probe />));
    expect(container.textContent).toContain("names:");
    expect(tokens).toHaveLength(0);
  });
}
