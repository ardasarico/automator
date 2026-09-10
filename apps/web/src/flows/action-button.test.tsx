/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const { FlowActionButton, FlowActionCard } = await import("./action-button");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

afterAll(() => GlobalRegistrator.unregister());

/** An action that fails the way the server action does when the API is unreachable. */
function failing(message = "Automator is unavailable right now. Try again shortly.") {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release: () => release?.(),
    action: async () => {
      await held;
      return { error: message };
    },
  };
}

test("a failed action says so and leaves the button ready to try again", async () => {
  const { action, release } = failing();
  await act(async () => root.render(<FlowActionButton action={action}>New flow</FlowActionButton>));
  const button = container.querySelector("button")!;
  expect(container.querySelector("[role=alert]")).toBeNull();

  await act(async () => {
    button.click();
  });
  // While the action is in flight the button says so and refuses a second submit.
  expect(button.getAttribute("data-loading")).not.toBeNull();

  await act(async () => {
    release();
    await Promise.resolve();
  });
  const alert = container.querySelector("[role=alert]");
  expect(alert?.textContent).toBe("Automator is unavailable right now. Try again shortly.");
  expect(button.getAttribute("data-loading")).toBeNull();
  expect(button.hasAttribute("disabled")).toBe(false);
});

test("a successful action leaves no message behind", async () => {
  await act(async () =>
    root.render(<FlowActionButton action={async () => null}>New flow</FlowActionButton>),
  );
  await act(async () => {
    container.querySelector("button")!.click();
  });
  expect(container.querySelector("[role=alert]")).toBeNull();
});

test("a failed card action says so on the card", async () => {
  const { action, release } = failing("Automator is unavailable right now. Try again shortly.");
  await act(async () =>
    root.render(
      <FlowActionCard action={action} className="card">
        Start blank
      </FlowActionCard>,
    ),
  );
  await act(async () => {
    container.querySelector("button")!.click();
  });
  await act(async () => {
    release();
    await Promise.resolve();
  });
  expect(container.querySelector("[role=alert]")?.textContent).toContain("unavailable");
  expect(container.querySelector("button")!.hasAttribute("disabled")).toBe(false);
});
