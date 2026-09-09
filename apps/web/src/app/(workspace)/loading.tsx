import { Spinner } from "@automator/ui/spinner";
import { PageFrame } from "../../components/page-frame";

/**
 * The frame arrives before its page does, so the title bar and the gutter hold their place
 * and only the heading and the content are still to come.
 */
export default function WorkspaceLoading() {
  return (
    <PageFrame
      title={
        <>
          <span className="sr-only">Loading</span>
          <span
            aria-hidden="true"
            className="block h-5 w-32 animate-pulse rounded-md bg-foreground/8"
          />
        </>
      }
    >
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner label="Loading" className="size-6 text-muted-foreground" />
      </div>
    </PageFrame>
  );
}
