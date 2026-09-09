import { ActivitySkeleton } from "../../../home/activity-skeleton";
import { HomeExamples } from "../../../home/examples";
import { HomePrompt } from "../../../home/prompt";

/**
 * Home's own loading state, because the workspace's — a breadcrumb bar over a centred spinner —
 * describes a page frame Home does not have. Everything here is static, so the fallback is the
 * page itself with the tape still empty, and arriving only fills the rows in.
 */
export default function HomeLoading() {
  return (
    <>
      <HomePrompt />
      <HomeExamples />
      <ActivitySkeleton />
    </>
  );
}
