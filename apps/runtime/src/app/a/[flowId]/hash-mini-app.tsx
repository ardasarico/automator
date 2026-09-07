"use client";

import type { FlowDocument } from "@automator/contracts";
import { decodeDocumentHash, MiniApp } from "@automator/miniapp";
import { useEffect, useState } from "react";
import { MiniAppShell, NotFoundNotice } from "./shell";

type Loaded = { hash: string; document: FlowDocument | null };

/** Reads the flow document from the fragment, again whenever it changes. */
export function HashMiniApp({ flowId }: { flowId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const read = () => {
      const hash = window.location.hash;
      setLoaded({ hash, document: decodeDocumentHash(hash) });
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [flowId]);

  if (loaded === null) return <main className="min-h-dvh" aria-busy="true" />;
  if (loaded.document === null) return <NotFoundNotice />;

  return (
    <MiniAppShell>
      <MiniApp key={loaded.hash} document={loaded.document} name={loaded.document.name} />
    </MiniAppShell>
  );
}
