"use client";

import {
  answerMiniAppSessionContract,
  buildPath,
  parseResponse,
  startMiniAppSessionContract,
  type MiniAppSession,
} from "@automator/contracts";
import { RemoteMiniApp, type MiniAppClient } from "@automator/miniapp";
import { useMemo } from "react";
import { IdentityHost } from "./identity-host";
import { MiniAppShell } from "./shell";

async function post(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`/api/a${path.replace("/public/flows", "")}`, {
    method: "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  return { status: response.status, json: await response.json() };
}

function createClient(flowId: string): MiniAppClient {
  return {
    async start(signal): Promise<MiniAppSession> {
      const { status, json } = await post(
        buildPath(startMiniAppSessionContract, { id: flowId }),
        undefined,
        signal,
      );
      const result = parseResponse(startMiniAppSessionContract, status, json);
      if (result.status !== 201) throw new Error(result.data.error);
      return result.data;
    },
    async answer(sessionId, answer, signal): Promise<MiniAppSession> {
      const { status, json } = await post(
        buildPath(answerMiniAppSessionContract, { id: flowId, sessionId }),
        answer,
        signal,
      );
      const result = parseResponse(answerMiniAppSessionContract, status, json);
      if (result.status !== 200) throw new Error(result.data.error);
      return result.data;
    },
  };
}

export function PublishedMiniApp({ flowId, name }: { flowId: string; name: string }) {
  const client = useMemo(() => createClient(flowId), [flowId]);
  return (
    <MiniAppShell>
      <IdentityHost>
        <RemoteMiniApp client={client} name={name} />
      </IdentityHost>
    </MiniAppShell>
  );
}
