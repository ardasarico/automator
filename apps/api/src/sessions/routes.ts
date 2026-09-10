import {
  answerMiniAppSessionContract,
  flowNodeConfigSchemas,
  flowChainId,
  findScreenFormAnswerProblem,
  isIdentityScreenType,
  isScreenNodeType,
  miniAppAnswerSchema,
  miniAppFailureMessage,
  parseNodeConfig,
  parseScreenConfig,
  screenPorts,
  startMiniAppSessionContract,
  Type,
  Value,
  visitorAnswer,
  type FlowDocument,
  type FlowNode,
  type FlowRun,
  type MiniAppFailureCode,
  type MiniAppAnswer,
  type MiniAppSession,
  type MiniAppStep,
  type ScreenNodeType,
  type WorldSelfieCheck,
  type WorldSelfieRejection,
} from "@automator/contracts";
import type { FlowStore, MiniAppSessionRow, RunStore, SessionStore } from "@automator/db";
import {
  resolveTemplates,
  screenScope,
  runFlow,
  type RunOptions,
  type SecretsResolver,
} from "@automator/flow-engine";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import type { IdentityProvider } from "../auth/privy";
import type { ChainFactory } from "../chain/provider";
import type { DataFactory } from "../data/provider";
import { clientAddress, createRateLimiter, defaultRateLimits } from "../rate-limit";
import { WorldVerifyError, type WorldVerifier } from "../world/verify";

export interface SessionDependencies {
  flows: FlowStore;
  runs: RunStore;
  sessions: SessionStore;
  engine?: Pick<
    RunOptions,
    "fetch" | "sleep" | "executors" | "model" | "sandbox" | "chain" | "data" | "graph"
  >;
  secretsFor?: (ownerId: string) => SecretsResolver;
  chainFactory?: ChainFactory;
  dataFactory?: DataFactory;
  callsPerMinute?: number;
  now?: () => number;
  identity?: Pick<IdentityProvider, "visitor">;
  world?: WorldVerifier;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenMatches(row: MiniAppSessionRow, token: string): boolean {
  const expected = Buffer.from(row.tokenHash, "hex");
  const given = Buffer.from(hashToken(token), "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type ScreenScope = {
  input?: Record<string, unknown>;
  vars: Record<string, unknown>;
  trigger: unknown;
};

function screenConfig(node: FlowNode & { type: ScreenNodeType }, scope: ScreenScope) {
  const parsed = parseScreenConfig(node.type, node.config);
  return resolveTemplates(parsed, {
    input: scope.input ?? {},
    vars: scope.vars,
    trigger: scope.trigger,
  });
}

export function failureCode(error: string | undefined): MiniAppFailureCode {
  if (!error) return "node_failed";
  if (error === "The run was cancelled.") return "cancelled";
  if (/timed out|timeout/i.test(error)) return "timeout";
  if (
    /is not configured|is not defined|is not enabled|has no wallet|^No .+ is configured/i.test(
      error,
    )
  )
    return "unconfigured";
  return "node_failed";
}

function visitorHelp(document: FlowDocument): string {
  const entry = document.nodes.find((node) => node.type === "trigger.miniapp-open");
  if (!entry) return "";
  try {
    return parseNodeConfig(
      flowNodeConfigSchemas["trigger.miniapp-open"],
      entry.config,
    ).visitorErrorMessage.trim();
  } catch {
    return "";
  }
}

function toSession(
  sessionId: string,
  document: FlowDocument,
  run: FlowRun,
  scope: ScreenScope,
  world: WorldVerifier | undefined,
): MiniAppSession {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const steps: MiniAppStep[] = [];
  for (const result of run.nodes) {
    if (result.status !== "succeeded" && result.status !== "failed") continue;
    const node = byId.get(result.nodeId);
    if (!node || isScreenNodeType(node.type) || node.type.startsWith("trigger.")) continue;
    steps.push({ nodeId: node.id, label: node.label, status: result.status });
  }
  if (run.status === "waiting") {
    const waiting = run.nodes.find((result) => result.status === "waiting");
    const node = waiting ? byId.get(waiting.nodeId) : undefined;
    if (node && isScreenNodeType(node.type)) {
      const type = node.type;
      const config = screenConfig(
        { ...node, type },
        { ...scope, input: screenScope(document, run, node.id).input },
      );
      const action =
        type === "world.id-verify" || type === "world.selfie-check"
          ? (config as { action: string }).action
          : "";
      const request = world && action !== "" ? world.requestContext(action) : undefined;
      return {
        sessionId,
        status: "screen",
        steps,
        screen: {
          nodeId: node.id,
          type,
          label: node.label,
          config,
          ...(request ? { world: request } : {}),
        },
      };
    }
  }
  if (run.status === "succeeded") return { sessionId, status: "end", steps };
  const failed = run.nodes.find((result) => result.status === "failed");
  const help = visitorHelp(document);
  return {
    sessionId,
    status: "failed",
    steps,
    error: miniAppFailureMessage,
    code: failureCode(failed?.error ?? run.error),
    ...(help ? { help } : {}),
  };
}

type Resume = NonNullable<RunOptions["resume"]>;

type IdentityOutcome =
  | { resume: Resume }
  | { status: 400 | 401 | 503; error: "invalid_request" | "unauthorized" | "unavailable" };

async function answerIdentityScreen(
  node: FlowNode,
  body: MiniAppAnswer,
  row: MiniAppSessionRow,
  deps: Pick<SessionDependencies, "identity" | "world">,
  input: Record<string, unknown>,
): Promise<IdentityOutcome> {
  const failed = (error: string): IdentityOutcome => ({
    resume: { nodeId: node.id, outputs: {}, variables: row.variables, error },
  });
  if (node.type === "privy.login") {
    if (!body.privyToken) return { status: 400, error: "invalid_request" };
    if (!deps.identity?.visitor)
      return failed(
        "Sign-in is not configured on this server: set PRIVY_APP_ID and PRIVY_APP_SECRET",
      );
    const visitor = await deps.identity.visitor(body.privyToken);
    if (!visitor) return { status: 401, error: "unauthorized" };
    return {
      resume: {
        nodeId: node.id,
        outputs: { [screenPorts(node.type).primary]: visitor },
        variables: { ...row.variables, visitor },
      },
    };
  }
  if (node.type === "world.id-verify") {
    if (!body.worldProof) return { status: 400, error: "invalid_request" };
    if (!deps.world) return failed("World ID is not configured on this server: set WORLD_APP_ID");
    const config = resolveTemplates(parseScreenConfig(node.type, node.config), {
      input,
      vars: row.variables,
      trigger: row.payload,
    });
    if (!config.action)
      return failed("World ID verify needs an action id from the Developer Portal");
    const ports = screenPorts(node.type);
    try {
      const result = await deps.world.verify({
        action: config.action,
        signal: config.signal,
        verificationLevel: config.verificationLevel,
        proof: body.worldProof,
      });
      return {
        resume: {
          nodeId: node.id,
          outputs: result.ok
            ? { [ports.primary]: result.verification }
            : { [ports.secondary ?? ports.primary]: result.rejection },
          variables: row.variables,
        },
      };
    } catch (error) {
      if (error instanceof WorldVerifyError) return { status: 503, error: "unavailable" };
      throw error;
    }
  }
  if (node.type === "world.selfie-check") {
    if (!body.worldProof) return { status: 400, error: "invalid_request" };
    if (!deps.world) return failed("World ID is not configured on this server: set WORLD_APP_ID");
    const config = resolveTemplates(parseScreenConfig(node.type, node.config), {
      input,
      vars: row.variables,
      trigger: row.payload,
    });
    if (!config.action) return failed("Selfie Check needs an action id from the Developer Portal");
    const ports = screenPorts(node.type);
    try {
      const result = await deps.world.verify({
        action: config.action,
        signal: config.signal,
        verificationLevel: "selfie",
        proof: body.worldProof,
      });
      // The gate shape: both branches say `verified` so a condition can read it either way.
      const outputs: WorldSelfieCheck | WorldSelfieRejection = result.ok
        ? {
            verified: true,
            nullifierHash: result.verification.nullifierHash,
            credential: result.verification.verificationLevel,
            action: result.verification.action,
          }
        : { verified: false, ...result.rejection };
      return {
        resume: {
          nodeId: node.id,
          outputs: { [result.ok ? ports.primary : (ports.secondary ?? ports.primary)]: outputs },
          variables: row.variables,
        },
      };
    } catch (error) {
      if (error instanceof WorldVerifyError) return { status: 503, error: "unavailable" };
      throw error;
    }
  }
  return { status: 400, error: "invalid_request" };
}

export function createSessionRoutes({
  flows,
  runs,
  sessions,
  engine,
  secretsFor,
  chainFactory,
  dataFactory,
  callsPerMinute = defaultRateLimits.sessions,
  now = Date.now,
  identity,
  world,
}: SessionDependencies) {
  const limiter = createRateLimiter(callsPerMinute, now);
  return new Elysia({ name: "sessions" })
    .onBeforeHandle(({ request, server, set, status }) => {
      const address = clientAddress(
        request.headers.get("x-forwarded-for"),
        server?.requestIP(request)?.address,
      );
      if (limiter.allow(address)) return;
      set.headers["Retry-After"] = String(limiter.retryAfter(address));
      return status(429, { error: "rate_limited" });
    })
    .post(
      startMiniAppSessionContract.path,
      async ({ params, status, request }) => {
        const found = await flows.findPublishedWithOwner(params.id);
        if (!found) return status(404, { error: "not_found" });
        const document = found.record.flow;
        const entry = document.nodes.find((node) => node.type === "trigger.miniapp-open");
        if (!entry) return status(422, { error: "invalid_flow" });
        const payload = { openedAt: new Date().toISOString() };
        const run = await runFlow(document, {
          ...engine,
          signal: request.signal,
          trigger: { nodeId: entry.id, payload },
          secrets: secretsFor?.(found.ownerId),
          chain: chainFactory
            ? await chainFactory.forUser(found.ownerId, "live", flowChainId(document))
            : undefined,
          data: dataFactory?.forOwner(found.ownerId, "live"),
        });
        await runs.create(found.ownerId, document, run, "miniapp");
        const sessionId = randomUUID();
        const token = randomBytes(24).toString("base64url");
        const session = toSession(
          sessionId,
          document,
          run,
          { vars: run.variables, trigger: payload },
          world,
        );
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
          worldNonce: session.screen?.world?.rpContext.nonce ?? null,
          worldExpiresAt: session.screen?.world?.rpContext.expires_at ?? null,
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
      async ({ params, body, status, request }) => {
        if (!Value.Check(miniAppAnswerSchema, body))
          return status(400, { error: "invalid_request" });
        const row = await sessions.find(params.id, params.sessionId);
        if (!row || !tokenMatches(row, body.token)) return status(404, { error: "not_found" });
        if (row.status !== "screen" || row.nodeId === null)
          return status(409, { error: "invalid_request" });
        if (body.nodeId !== row.nodeId) return status(409, { error: "invalid_request" });
        const found = await flows.findPublishedWithOwner(params.id);
        if (!found) return status(404, { error: "not_found" });
        const previous = row.lastRunId ? await runs.find(row.ownerId, row.lastRunId) : null;
        if (!previous || previous.run.flowId !== row.flowId)
          return status(409, { error: "invalid_request" });
        const document = previous.document;
        const node = document.nodes.find((candidate) => candidate.id === row.nodeId);
        if (!node || !isScreenNodeType(node.type)) return status(409, { error: "invalid_request" });
        const ports = screenPorts(node.type);
        if (body.port !== ports.primary && body.port !== ports.secondary)
          return status(400, { error: "invalid_request" });
        let resume: Resume;
        if (isIdentityScreenType(node.type)) {
          // A valid proof for another visitor session is not this screen's answer. Keep the
          // issued request bound to this pause; mismatches never reach the World portal.
          if (
            world &&
            (node.type === "world.id-verify" || node.type === "world.selfie-check") &&
            body.worldProof &&
            (row.worldNonce !== body.worldProof.nonce ||
              row.worldExpiresAt === null ||
              row.worldExpiresAt <= now() / 1000)
          )
            return status(400, { error: "invalid_request" });
          const outcome = await answerIdentityScreen(
            node,
            body,
            row,
            { identity, world },
            screenScope(document, previous.run, node.id).input,
          );
          if (!("resume" in outcome)) return status(outcome.status, { error: outcome.error });
          resume = outcome.resume;
        } else {
          if (node.type === "screen.form") {
            const config = resolveTemplates(parseScreenConfig(node.type, node.config), {
              input: screenScope(document, previous.run, node.id).input,
              vars: row.variables,
              trigger: row.payload,
            });
            if (findScreenFormAnswerProblem(config, body.data))
              return status(400, { error: "invalid_request" });
          }
          resume = {
            nodeId: node.id,
            outputs: {
              [body.port]:
                node.type === "screen.form" ? (body.data ?? {}) : visitorAnswer(body.port),
            },
            variables: row.variables,
          };
        }
        // Provider failures before execution remain retryable. Claim the screen only once
        // every prerequisite is ready, before any node can send a message or transaction.
        const chain = chainFactory
          ? await chainFactory.forUser(found.ownerId, "live", flowChainId(document))
          : undefined;
        if (!(await sessions.claim(row))) return status(409, { error: "invalid_request" });
        const run = await runFlow(document, {
          ...engine,
          signal: request.signal,
          trigger: { payload: row.payload },
          resume: { ...resume, completed: previous.run.nodes },
          secrets: secretsFor?.(found.ownerId),
          chain,
          data: dataFactory?.forOwner(found.ownerId, "live"),
        });
        await runs.create(found.ownerId, document, run, "miniapp");
        const session = toSession(
          row.id,
          document,
          run,
          { vars: run.variables, trigger: row.payload },
          world,
        );
        await sessions.update(row.id, {
          status: session.status,
          nodeId: session.screen?.nodeId ?? null,
          variables: run.variables,
          lastRunId: run.id,
          worldNonce: session.screen?.world?.rpContext.nonce ?? null,
          worldExpiresAt: session.screen?.world?.rpContext.expires_at ?? null,
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
