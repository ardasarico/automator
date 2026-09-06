import { Spinner } from "@automator/ui/spinner";
import { WorkspacePage } from "../../components/workspace-page";

export default function WorkspaceLoading() {
  return (
    <WorkspacePage>
      <div className="flex min-h-10 items-center">
        <span className="h-6 w-32 animate-pulse rounded-md bg-foreground/8" />
      </div>
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner label="Loading" className="size-6 text-muted-foreground" />
      </div>
    </WorkspacePage>
  );
}
