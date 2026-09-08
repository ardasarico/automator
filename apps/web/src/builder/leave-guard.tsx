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

type Machine = { guard: LeaveGuardState; effect: LeaveGuardEffect; seq: number };

function step(machine: Machine, event: LeaveGuardEvent): Machine {
  const [guard, effect] = reduceLeaveGuard(machine.guard, event);
  return { guard, effect, seq: machine.seq + 1 };
}

const initial: Machine = { guard: idleLeaveGuard, effect: null, seq: 0 };

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dirty = useBuilderStore((state) => state.dirty);
  const name = useBuilderStore((state) => state.meta.name);
  const { save } = useSaveFlowController();
  const [machine, dispatch] = useReducer(step, initial);
  // Each effect runs once, however often `save` or the router change identity afterwards.
  const handled = useRef(0);
  const acceptedHistoryKey = useRef<string | null>(null);

  useEffect(() => {
    const { effect, seq } = machine;
    if (!effect || handled.current === seq) return;
    handled.current = seq;
    if (effect.type === "navigate") {
      if (effect.historyKey && window.navigation) {
        acceptedHistoryKey.current = effect.historyKey;
        // Resume the original entry; never push a replacement URL or rewrite Next's state.
        const result = window.navigation.traverseTo(effect.historyKey);
        void result.finished?.catch(() => {
          acceptedHistoryKey.current = null;
        });
      } else router.push(effect.href);
    }
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
    const navigation = window.navigation;
    if (!navigation) return;
    const guardTraversal = (event: NavigateEvent) => {
      if (event.navigationType !== "traverse") return;
      if (event.destination.key === acceptedHistoryKey.current) {
        acceptedHistoryKey.current = null;
        return;
      }
      // Cross-document navigation uses beforeunload. Older browsers and browser
      // anti-trapping overrides may not permit cancellation; do not fake it with popstate.
      if (!dirty || !event.destination.sameDocument || !event.cancelable) return;
      event.preventDefault();
      dispatch({
        type: "request",
        href: event.destination.url,
        historyKey: event.destination.key,
        dirty: true,
      });
    };
    navigation.addEventListener("navigate", guardTraversal);
    return () => navigation.removeEventListener("navigate", guardTraversal);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
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
