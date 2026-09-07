import {
  answerMiniAppSessionContract,
  isScreenNodeType,
  miniAppAnswerSchema,
  parseScreenConfig,
  screenPorts,
  startMiniAppSessionContract,
  Type,
  Value,
  visitorAnswer,
  type FlowDocument,
  type FlowRun,
  type MiniAppSession,
  type MiniAppStep,
} from "@automator/contracts";
import type { FlowStore, MiniAppSessionRow, RunStore, SessionStore } from "@automator/db";
import { runFlow, type RunOptions, type SecretsResolver } from "@automator/flow-engine";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import type { ChainFactory } from "../chain/provider";

export interface SessionDependencies {
  flows: FlowStore;
  runs: RunStore;
  sessions: SessionStore;
  engine?: Pick<RunOptions, "fetch" | "sleep" | "executors" | "model" | "sandbox" | "chain">;
  /** The flow owner's `{{secrets.*}}`; absent when secrets are not configured. */
  secretsFor?: (ownerId: string) => SecretsResolver;
  /** The owner's live chain access for onchain nodes; absent when chains are not configured. */
  chainFactory?: ChainFactory;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenMatches(row: MiniAppSessionRow, token: string): boolean {
  const expected = Buffer.from(row.tokenHash, "hex");
  const given = Buffer.from(hashToken(token), "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * What the visitor may see of a finished run: the screen to show next (its own config
 * only), the steps worked through, or why it stopped. Never the document or other config.
 */
function toSession(sessionId: string, document: FlowDocument, run: FlowRun): MiniAppSession {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const steps: MiniAppStep[] = [];
  for (const result of run.nodes) {
    if (result.status !== "succeeded" && result.status !== "failed") continue;
    const node = byId.get(result.nodeId);
    if (!node || isScreenNodeType(node.type) || node.type.startsWith("trigger.")) continue;
    steps.push({
      nodeId: node.id,
      label: node.label,
      status: result.status,
      ...(result.error === undefined ? {} : { error: result.error }),
    });
  }
  if (run.status === "waiting") {
    const waiting = run.nodes.find((result) => result.status === "waiting");
    const node = waiting ? byId.get(waiting.nodeId) : undefined;
    if (node && isScreenNodeType(node.type)) {
      return {
        sessionId,
        status: "screen",
        steps,
        screen: {
          nodeId: node.id,
          type: node.type,
          label: node.label,
          config: parseScreenConfig(node.type, node.config),
        },
      };
    }
  }
  if (run.status === "succeeded") return { sessionId, status: "end", steps };
  const failed = run.nodes.find((result) => result.status === "failed");
  return {
    sessionId,
    status: "failed",
    steps,
    error: failed?.error ?? run.error ?? "The flow failed",
  };
}

/**
 * Sessions of a published mini-app. The API runs the flow as its owner, with the owner's
 * secrets, and stores every run in the owner's history; the visitor holds a session id and
 * a token, and only ever receives the current screen. Publishing is the owner's consent, so
 * a session runs whether or not the flow's unattended triggers are enabled.
 */
export function createSessionRoutes({
  flows,
  runs,
  sessions,
  engine,
  secretsFor,
  chainFactory,
}: SessionDependencies) {
  return new Elysia({ name: "sessions" })
    .post(
      startMiniAppSessionContract.path,
      async ({ params, status }) => {
        const found = await flows.findPublishedWithOwner(params.id);
        if (!found) return status(404, { error: "not_found" });
        const document = found.record.flow;
        const entry = document.nodes.find((node) => node.type === "trigger.miniapp-open");
        if (!entry) return status(422, { error: "invalid_flow" });
        const payload = { openedAt: new Date().toISOString() };
        const run = await runFlow(document, {
          ...engine,
          trigger: { nodeId: entry.id, payload },
          secrets: secretsFor?.(found.ownerId),
          chain: chainFactory ? await chainFactory.forUser(found.ownerId, "live") : undefined,
        });
        await runs.create(found.ownerId, document, run, "miniapp");
        const sessionId = randomUUID();
        const token = randomBytes(24).toString("base64url");
        const session = toSession(sessionId, document, run);
        await sessions.create({
          id: sessionId,
          flowId: document.id,
          ownerId: found.ownerId,
          tokenHash: hashToken(token),
          status: session.status,
          nodeId: session.screen?.nodeId ?? null,
          variables: run.variables,
          payload,
          lastRunId: run.id,
        });
        return status(201, { ...session, token });
      },
      {
        params: startMiniAppSessionContract.params,
        response: startMiniAppSessionContract.response,
      },
    )
    .post(
      answerMiniAppSessionContract.path,
      async ({ params, body, status }) => {
        if (!Value.Check(miniAppAnswerSchema, body))
          return status(400, { error: "invalid_request" });
        const row = await sessions.find(params.id, params.sessionId);
        // A wrong token and an unknown session look the same, so the id alone leaks nothing.
        if (!row || !tokenMatches(row, body.token)) return status(404, { error: "not_found" });
        if (row.status !== "screen" || row.nodeId === null)
          return status(409, { error: "invalid_request" });
        const found = await flows.findPublishedWithOwner(params.id);
        if (!found) return status(404, { error: "not_found" });
        const document = found.record.flow;
        const node = document.nodes.find((candidate) => candidate.id === row.nodeId);
        if (!node || !isScreenNodeType(node.type)) return status(409, { error: "invalid_request" });
        const ports = screenPorts(node.type);
        if (body.port !== ports.primary && body.port !== ports.secondary)
          return status(400, { error: "invalid_request" });
        const run = await runFlow(document, {
          ...engine,
          trigger: { payload: row.payload },
          resume: {
            nodeId: node.id,
            outputs: { [body.port]: visitorAnswer(body.port, body.data) },
            variables: row.variables,
          },
          secrets: secretsFor?.(found.ownerId),
          chain: chainFactory ? await chainFactory.forUser(found.ownerId, "live") : undefined,
        });
        await runs.create(found.ownerId, document, run, "miniapp");
        const session = toSession(row.id, document, run);
        await sessions.update(row.id, {
          status: session.status,
          nodeId: session.screen?.nodeId ?? null,
          variables: run.variables,
          lastRunId: run.id,
        });
        return session;
      },
      {
        params: answerMiniAppSessionContract.params,
        body: Type.Unknown(),
        response: answerMiniAppSessionContract.response,
      },
    );
}
