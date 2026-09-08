export type LeaveGuardState =
  | { status: "idle" }
  | {
      status: "confirming";
      href: string;
      historyKey?: string;
      saving: boolean;
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
