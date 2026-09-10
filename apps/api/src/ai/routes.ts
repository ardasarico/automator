import {
  clearAiMessagesContract,
  listAiMessagesContract,
  redactFlowSecrets,
  redactRunOutputs,
  sendAiMessageContract,
  setAiProposalStateContract,
  Type,
  Value,
  type AiContext,
  type AiPart,
  type AiStreamEvent,
} from "@automator/contracts";
import type { AiMessageStore, DataTableStore, FlowStore } from "@automator/db";
import type { LanguageModel } from "@automator/flow-engine";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import { createRateLimiter, defaultRateLimits } from "../rate-limit";
import { runCanvasAgent } from "./canvas-agent";
import { encodeSseEvent } from "./sse";

export interface AiDependencies {
  identity: IdentityProvider | undefined;
  model: LanguageModel | undefined;
  flows: Pick<FlowStore, "find">;
  messages: AiMessageStore;
  dataTables?: Pick<DataTableStore, "list">;
  log?: boolean;
  callsPerMinute?: number;
  now?: () => number;
  newId?: () => string;
}

export function createAiRoutes({
  identity,
  model,
  flows,
  messages,
  dataTables,
  log = false,
  callsPerMinute = defaultRateLimits.ai,
  now = Date.now,
  newId = () => crypto.randomUUID(),
}: AiDependencies) {
  const limiter = createRateLimiter(callsPerMinute, now);
  /*
   * Reads and deletes are never limited; only the route that actually invokes the model spends a
   * user's budget, and only once ownership resolves — a mistyped or foreign flow id (a 404) must
   * not cost anything.
   */
  const rateLimited = (
    claims: { id: string },
    set: { headers: Record<string, string | number> },
  ) => {
    if (limiter.allow(claims.id)) return false;
    set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
    return true;
  };
  return new Elysia({ name: "ai" })
    .use(createAuthGuard(identity))
    .get(
      listAiMessagesContract.path,
      async ({ claims, params, status }) => {
        if (!(await flows.find(claims.id, params.id))) return status(404, { error: "not_found" });
        return { messages: await messages.list(params.id) };
      },
      { params: listAiMessagesContract.params, response: listAiMessagesContract.response },
    )
    .post(
      sendAiMessageContract.path,
      async ({ claims, params, body, status, request, set }) => {
        if (!Value.Check(sendAiMessageContract.body, body))
          return status(400, { error: "invalid_request" });
        if (!model) return status(503, { error: "unavailable" });
        const record = await flows.find(claims.id, params.id);
        if (!record) return status(404, { error: "not_found" });
        if (rateLimited(claims, set)) return status(429, { error: "rate_limited" });
        const { id: _id, ...saved } = record.flow;
        // The builder already blanks secret fields; doing it here too keeps them off the model.
        const current = redactFlowSecrets(body.document ?? saved);
        const context: AiContext | undefined = body.context && {
          ...body.context,
          ...(body.context.run ? { run: redactRunOutputs(body.context.run) } : {}),
        };
        const tables = dataTables ? await dataTables.list(claims.id) : [];
        const history = await messages.list(params.id);
        await messages.markPendingStale(params.id);
        await messages.append(params.id, {
          id: newId(),
          role: "user",
          parts: [{ type: "text", text: body.text }],
          ...(context ? { context } : {}),
        });
        const assistantId = newId();
        const encoder = new TextEncoder();
        // Flipped by `cancel()` when the client disconnects mid-stream: a closed controller
        // throws on `enqueue`/`close`, and the turn below keeps running (persisting the
        // assistant message) long after that, so every write has to check first.
        let closed = false;
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const emit = (event: AiStreamEvent) => {
              if (closed) return;
              controller.enqueue(encoder.encode(encodeSseEvent(event)));
            };
            emit({ type: "message", id: assistantId });
            let parts: AiPart[];
            try {
              parts = await runCanvasAgent({
                model,
                text: body.text,
                // An empty canvas is a new flow; the model gets no document to edit.
                current: current.nodes.length === 0 ? undefined : current,
                context,
                history,
                tables,
                emit,
                signal: request.signal,
              });
            } catch (error) {
              // `runCanvasAgent` only ever rethrows a `LanguageModelError`, but whatever else
              // might slip through here (an abort, a genuine bug) gets the same clean ending:
              // a hung stream, with no `done` and nothing stored, is the worst outcome for the
              // user, so every path below closes the stream and persists something.
              if (log)
                console.warn("AI turn failed", error instanceof Error ? error.message : error);
              const part: AiPart = { type: "error", error: "unavailable" };
              emit(part);
              parts = [part];
            }
            try {
              await messages.append(params.id, { id: assistantId, role: "assistant", parts });
            } catch (error) {
              if (log)
                console.warn(
                  "AI message not stored",
                  error instanceof Error ? error.message : error,
                );
            }
            emit({ type: "done" });
            if (!closed) controller.close();
          },
          cancel() {
            closed = true;
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
          },
        });
      },
      /* No response schema: the 200 is a stream, and Elysia would try to validate it as JSON. */
      { params: sendAiMessageContract.params, body: Type.Unknown() },
    )
    .patch(
      setAiProposalStateContract.path,
      async ({ claims, params, body, status }) => {
        if (!Value.Check(setAiProposalStateContract.body, body))
          return status(400, { error: "invalid_request" });
        if (!(await flows.find(claims.id, params.id))) return status(404, { error: "not_found" });
        const message = await messages.setProposalState(params.id, params.messageId, body.state);
        if (!message) return status(404, { error: "not_found" });
        return { message };
      },
      {
        params: setAiProposalStateContract.params,
        body: Type.Unknown(),
        response: setAiProposalStateContract.response,
      },
    )
    .delete(
      clearAiMessagesContract.path,
      async ({ claims, params, status }) => {
        if (!(await flows.find(claims.id, params.id))) return status(404, { error: "not_found" });
        return { cleared: await messages.clear(params.id) };
      },
      { params: clearAiMessagesContract.params, response: clearAiMessagesContract.response },
    );
}
