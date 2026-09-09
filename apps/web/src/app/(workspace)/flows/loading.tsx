import { FLOWS_VIEW_COOKIE } from "../../../lib/preferences";
import { readPreferenceCookie } from "../../../lib/preferences.server";
import { FlowsSkeleton } from "./flows-skeleton";

/**
 * Flows' own loading state. The workspace's — a breadcrumb bar over a centred spinner —
 * describes a page frame this page no longer has, and a spinner says only that something is
 * happening; the frame with its cards drawn empty says what is coming.
 */
export default async function FlowsLoading() {
  const view = await readPreferenceCookie(FLOWS_VIEW_COOKIE);
  return <FlowsSkeleton view={view === "table" ? "table" : "grid"} />;
}
