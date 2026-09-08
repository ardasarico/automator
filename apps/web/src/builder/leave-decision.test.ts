import { describe, expect, test } from "bun:test";
import {
  idleLeaveGuard,
  isPlainNavigation,
  reduceLeaveGuard,
  type LeaveGuardState,
} from "./leave-decision";

const confirming: LeaveGuardState = {
  status: "confirming",
  href: "/flows",
  saving: false,
  error: null,
};

describe("reduceLeaveGuard", () => {
  test("a clean document navigates without asking", () => {
    expect(
      reduceLeaveGuard(idleLeaveGuard, { type: "request", href: "/flows", dirty: false }),
    ).toEqual([idleLeaveGuard, { type: "navigate", href: "/flows" }]);
  });

  test("a dirty document opens the dialog for that destination", () => {
    expect(
      reduceLeaveGuard(idleLeaveGuard, { type: "request", href: "/flows", dirty: true }),
    ).toEqual([confirming, null]);
  });

  test("Stay closes the dialog and Leave navigates without saving", () => {
    expect(reduceLeaveGuard(confirming, { type: "choose", choice: "stay" })).toEqual([
      idleLeaveGuard,
      null,
    ]);
    expect(reduceLeaveGuard(confirming, { type: "choose", choice: "leave" })).toEqual([
      idleLeaveGuard,
      { type: "navigate", href: "/flows" },
    ]);
  });

  test("Save and leave saves first and navigates only once the save succeeds", () => {
    const [saving, effect] = reduceLeaveGuard(confirming, { type: "choose", choice: "save" });
    expect(saving).toEqual({ ...confirming, saving: true });
    expect(effect).toEqual({ type: "save" });
    expect(reduceLeaveGuard(saving, { type: "choose", choice: "leave" })).toEqual([saving, null]);
    expect(reduceLeaveGuard(saving, { type: "saved" })).toEqual([
      idleLeaveGuard,
      { type: "navigate", href: "/flows" },
    ]);
  });

  test("a failed save keeps the dialog open with the message", () => {
    const [saving] = reduceLeaveGuard(confirming, { type: "choose", choice: "save" });
    expect(reduceLeaveGuard(saving, { type: "save-failed", message: "Nope" })).toEqual([
      { ...confirming, error: "Nope" },
      null,
    ]);
  });

  test("history destination survives failed saves and competing requests during save", () => {
    const [pending] = reduceLeaveGuard(idleLeaveGuard, {
      type: "request",
      href: "/runs",
      historyKey: "original-entry",
      dirty: true,
    });
    const [saving] = reduceLeaveGuard(pending, { type: "choose", choice: "save" });
    expect(reduceLeaveGuard(saving, { type: "request", href: "/flows", dirty: true })).toEqual([
      saving,
      null,
    ]);
    const [failed] = reduceLeaveGuard(saving, { type: "save-failed", message: "Unavailable" });
    expect(reduceLeaveGuard(failed, { type: "choose", choice: "leave" })).toEqual([
      idleLeaveGuard,
      { type: "navigate", href: "/runs", historyKey: "original-entry" },
    ]);
    expect(reduceLeaveGuard(saving, { type: "saved" })).toEqual([
      idleLeaveGuard,
      { type: "navigate", href: "/runs", historyKey: "original-entry" },
    ]);
  });

  test("save outcomes and choices are ignored while idle", () => {
    expect(reduceLeaveGuard(idleLeaveGuard, { type: "saved" })).toEqual([idleLeaveGuard, null]);
    expect(reduceLeaveGuard(idleLeaveGuard, { type: "choose", choice: "leave" })).toEqual([
      idleLeaveGuard,
      null,
    ]);
  });
});

describe("isPlainNavigation", () => {
  test("only plain left clicks are intercepted", () => {
    expect(isPlainNavigation({})).toBe(true);
    expect(isPlainNavigation({ button: 0 })).toBe(true);
    expect(isPlainNavigation({ metaKey: true })).toBe(false);
    expect(isPlainNavigation({ ctrlKey: true })).toBe(false);
    expect(isPlainNavigation({ shiftKey: true })).toBe(false);
    expect(isPlainNavigation({ button: 1 })).toBe(false);
    expect(isPlainNavigation({ defaultPrevented: true })).toBe(false);
  });
});
