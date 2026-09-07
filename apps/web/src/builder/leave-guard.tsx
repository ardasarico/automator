"use client";

import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@automator/ui/alert-dialog";
import { Button } from "@automator/ui/button";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  idleLeaveGuard,
  isPlainNavigation,
  reduceLeaveGuard,
  type LeaveChoice,
  type LeaveGuardEffect,
  type LeaveGuardEvent,
  type LeaveGuardState,
} from "./leave-decision";
import { useSaveFlowController } from "./save-button";
import { useBuilderStore } from "./store-provider";

const LeaveGuardContext = createContext<((href: string) => void) | null>(null);

/** The decision state plus the effect its last event asked for; `seq` tells effects apart. */
type Machine = { guard: LeaveGuardState; effect: LeaveGuardEffect; seq: number };

function step(machine: Machine, event: LeaveGuardEvent): Machine {
  const [guard, effect] = reduceLeaveGuard(machine.guard, event);
  return { guard, effect, seq: machine.seq + 1 };
}

const initial: Machine = { guard: idleLeaveGuard, effect: null, seq: 0 };

/**
 * Keeps unsaved changes from being lost: while the store is dirty, closing or reloading the
 * tab asks through the browser's own prompt, and an in-app link away from the canvas opens
 * the "Leave without saving?" dialog instead of navigating. Save and leave runs the shared
 * save path and only navigates once it succeeds.
 */
export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dirty = useBuilderStore((state) => state.dirty);
  const name = useBuilderStore((state) => state.meta.name);
  const { save } = useSaveFlowController();
  const [machine, dispatch] = useReducer(step, initial);
  // Each effect runs once, however often `save` or the router change identity afterwards.
  const handled = useRef(0);

  useEffect(() => {
    const { effect, seq } = machine;
    if (!effect || handled.current === seq) return;
    handled.current = seq;
    if (effect.type === "navigate") router.push(effect.href);
    if (effect.type === "save")
      void save().then((outcome) =>
        dispatch(outcome.ok ? { type: "saved" } : { type: "save-failed", ...outcome }),
      );
  }, [machine, router, save]);

  const request = useCallback(
    (href: string) => dispatch({ type: "request", href, dirty }),
    [dirty],
  );
  const choose = (choice: LeaveChoice) => dispatch({ type: "choose", choice });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      // Browsers show their own generic prompt; the text is not customisable.
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const confirming = machine.guard.status === "confirming" ? machine.guard : null;

  return (
    <LeaveGuardContext.Provider value={request}>
      {children}
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && choose("stay")}>
        <AlertDialogPopup className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              “{name}” has unsaved changes. Save them before you leave, or they are lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirming?.error && (
            <p role="alert" className="px-6 pb-4 text-caption text-destructive-text">
              {confirming.error}
            </p>
          )}
          <AlertDialogFooter>
            <Button variant="outline" disabled={confirming?.saving} onClick={() => choose("stay")}>
              Stay
            </Button>
            <Button
              variant="destructive"
              disabled={confirming?.saving}
              onClick={() => choose("leave")}
            >
              Leave
            </Button>
            <Button loading={confirming?.saving} onClick={() => choose("save")}>
              Save and leave
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </LeaveGuardContext.Provider>
  );
}

/**
 * A click handler for a link that leaves the canvas: a plain click is intercepted and goes
 * through the guard, a modified click (new tab) passes through. Outside the builder, or
 * without a provider, it does nothing and the link works as usual.
 */
export function useLeaveGuard(): (href: string) => (event: MouseEvent<HTMLElement>) => void {
  const request = useContext(LeaveGuardContext);
  return useCallback(
    (href: string) => (event: MouseEvent<HTMLElement>) => {
      if (!request || !isPlainNavigation(event)) return;
      event.preventDefault();
      request(href);
    },
    [request],
  );
}
