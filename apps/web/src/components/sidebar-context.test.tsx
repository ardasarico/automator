/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, test } from "bun:test";
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  SidebarProvider,
  useCollapseSidebarWhileMounted,
  useSidebar,
  type SidebarState,
} from "./sidebar-context";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

function StateProbe() {
  const { state } = useSidebar();
  return <span data-testid="state">{state}</span>;
}

function CollapseWhileMounted() {
  useCollapseSidebarWhileMounted();
  return null;
}

/** Mounts `CollapseWhileMounted` until the "leave" button unmounts it, simulating a canvas visit. */
function Visit() {
  const [onCanvas, setOnCanvas] = useState(true);
  return (
    <>
      {onCanvas && <CollapseWhileMounted />}
      <button type="button" onClick={() => setOnCanvas(false)}>
        leave
      </button>
    </>
  );
}

function ExplicitSetState({ to }: { to: SidebarState }) {
  const { setState } = useSidebar();
  return (
    <button type="button" onClick={() => setState(to)}>
      set
    </button>
  );
}

async function render(children: React.ReactNode, defaultState: SidebarState = "open") {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <StrictMode>
        <SidebarProvider defaultState={defaultState}>{children}</SidebarProvider>
      </StrictMode>,
    );
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("collapsing while mounted restores the pre-mount state once the visit ends", async () => {
  const view = await render(
    <>
      <StateProbe />
      <Visit />
    </>,
  );
  try {
    expect(view.container.querySelector("[data-testid=state]")!.textContent).toBe("collapsed");
    await act(async () => {
      view.container.querySelector("button")!.click(); // "leave"
    });
    expect(view.container.querySelector("[data-testid=state]")!.textContent).toBe("open");
  } finally {
    await view.unmount();
  }
});

test("an explicit setState during the visit is not undone when the visit ends", async () => {
  const view = await render(
    <>
      <StateProbe />
      <Visit />
      <ExplicitSetState to="collapsed" />
    </>,
  );
  try {
    expect(view.container.querySelector("[data-testid=state]")!.textContent).toBe("collapsed");
    const buttons = view.container.querySelectorAll("button");
    await act(async () => {
      buttons[1]!.click(); // "set" — explicit collapse, cancels the pending restore
    });
    await act(async () => {
      buttons[0]!.click(); // "leave"
    });
    expect(view.container.querySelector("[data-testid=state]")!.textContent).toBe("collapsed");
  } finally {
    await view.unmount();
  }
});
