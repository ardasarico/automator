/**
 * What a flow server action answers with when it could not do the thing. Success is `null`: the
 * action redirects, so there is nothing left to render. Kept apart from `actions.ts` because the
 * client components import the type and that module is server-only.
 */
export type FlowActionState = { error: string } | null;

/**
 * The API was unreachable or answered 503 — most often our own deploy swapping instances, which
 * is over in seconds, so the sentence asks for a retry rather than reporting a fault.
 */
export const actionUnavailable = "Automator is unavailable right now. Try again shortly.";
