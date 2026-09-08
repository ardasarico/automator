/**
 * The unsaved-changes guard as a pure state machine, so the dialog's decisions are testable
 * without React: the hook feeds it events and carries out the effects it answers with.
 */

export type LeaveGuardState =
  | { status: "idle" }
  | {
      status: "confirming";
      /** Where the user was going. */
      href: string;
      /** Existing browser entry to traverse to, instead of pushing a new link. */
      historyKey?: string;
      /** True while "Save and leave" is saving. */
      saving: boolean;
      /** Why the last save failed, shown in the dialog. */
      error: string | null;
    };

export type LeaveChoice = "save" | "leave" | "stay";

export type LeaveGuardEvent =
  | { type: "request"; href: string; historyKey?: string; dirty: boolean }
  | { type: "choose"; choice: LeaveChoice }
  | { type: "saved" }
  | { type: "save-failed"; message: string };

export type LeaveGuardEffect =
  | { type: "navigate"; href: string; historyKey?: string }
  | { type: "save" }
  | null;

function destination(value: { href: string; historyKey?: string }) {
  return value.historyKey
    ? { href: value.href, historyKey: value.historyKey }
    : { href: value.href };
}

export const idleLeaveGuard: LeaveGuardState = { status: "idle" };

/**
 * A clean document navigates straight away; a dirty one asks. Leave navigates without saving,
 * Stay closes the dialog, Save runs the save path and only navigates once it succeeds; a
 * failed save keeps the dialog open with the message so the user can retry or leave anyway.
 */
export function reduceLeaveGuard(
  state: LeaveGuardState,
  event: LeaveGuardEvent,
): [LeaveGuardState, LeaveGuardEffect] {
  switch (event.type) {
    case "request":
      if (state.status === "confirming" && state.saving) return [state, null];
      if (!event.dirty) return [idleLeaveGuard, { type: "navigate", ...destination(event) }];
      return [{ status: "confirming", ...destination(event), saving: false, error: null }, null];
    case "choose": {
      if (state.status !== "confirming" || state.saving) return [state, null];
      if (event.choice === "stay") return [idleLeaveGuard, null];
      if (event.choice === "leave")
        return [idleLeaveGuard, { type: "navigate", ...destination(state) }];
      return [{ ...state, saving: true, error: null }, { type: "save" }];
    }
    case "saved":
      if (state.status !== "confirming" || !state.saving) return [state, null];
      return [idleLeaveGuard, { type: "navigate", ...destination(state) }];
    case "save-failed":
      if (state.status !== "confirming" || !state.saving) return [state, null];
      return [{ ...state, saving: false, error: event.message }, null];
  }
}

/**
 * Whether a link click should be intercepted: plain left clicks only. Modified clicks open a
 * new tab or window, which leaves the canvas where it is, so they pass through untouched.
 */
export function isPlainNavigation(event: {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
}): boolean {
  return (
    !event.defaultPrevented &&
    (event.button ?? 0) === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
