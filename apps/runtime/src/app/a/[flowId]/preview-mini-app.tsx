"use client";

import type { FlowDocument } from "@automator/contracts";
import { receivePreview, MiniApp } from "@automator/miniapp";
import { useEffect, useState } from "react";
import { MiniAppShell } from "./shell";

export function PreviewMiniApp({ flowId, builderUrl }: { flowId: string; builderUrl?: string }) {
  const [loaded, setLoaded] = useState<{ flowId: string; document: FlowDocument | null } | null>(
    null,
  );

  useEffect(
    () =>
      receivePreview(flowId, builderUrl, (document) => {
        setLoaded({ flowId, document });
      }),
    [flowId, builderUrl],
  );

  if (loaded === null || loaded.flowId !== flowId)
    return <main className="min-h-dvh" aria-busy="true" />;
  if (loaded.document === null)
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-8">
        <h1 className="text-page text-balance">Preview unavailable</h1>
        <p className="text-pretty text-muted-foreground">
          Open this preview from the builder and keep that tab open. Preview links do not contain
          your flow and cannot be shared. Publish the app to share it.
        </p>
      </main>
    );

  return (
    <MiniAppShell>
      <MiniApp key={flowId} document={loaded.document} name={loaded.document.name} />
    </MiniAppShell>
  );
}
