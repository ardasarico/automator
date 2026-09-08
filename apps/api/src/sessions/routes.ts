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
import { clientAddress, createRateLimiter, defaultRateLimits } from "../rate-limit";
import { WorldVerifyError, type WorldVerifier } from "../world/verify";

export interface SessionDependencies {
  flows: FlowStore;
  runs: RunStore;
  sessions: SessionStore;
  engine?: Pick<RunOptions, "fetch" | "sleep" | "executors" | "model" | "sandbox" | "chain">;
  /** The flow owner's `{{secrets.*}}`; absent when secrets are not configured. */
  secretsFor?: (ownerId: string) => SecretsResolver;
  /** The owner's live chain access for onchain nodes; absent when chains are not configured. */
  chainFactory?: ChainFactory;
  /** Session calls one client address may make per minute before 429; sixty by default. */
  callsPerMinute?: number;
  now?: () => number;
  /** Verifies a visitor's Privy token for `privy.login`; absent leaves that node unconfigured. */
  identity?: Pick<IdentityProvider, "visitor">;
  /** Verifies World ID proofs for `world.id-verify`; absent leaves that node unconfigured. */
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

/** A screen sees only its incoming values, session variables and opening payload; never secrets. */
type ScreenScope = {
  input?: Record<string, unknown>;
  vars: Record<string, unknown>;
  trigger: unknown;
};

/**
 * Resolve screen templates before rendering, consistently with preview and identity verification.
 */
function screenConfig(node: FlowNode & { type: ScreenNodeType }, scope: ScreenScope) {
  const parsed = parseScreenConfig(node.type, node.config);
  return resolveTemplates(parsed, {
    input: scope.input ?? {},
    vars: scope.vars,
    trigger: scope.trigger,
  });
}

/**
 * What kind of failure the engine's error text describes. The text itself (which can name
 * URLs, addresses, revert data or secret names) never leaves the owner's stored run.
 */
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

/** The owner's note to visitors from the mini-app trigger, or nothing when unset or unreadable. */
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

/**
 * What the visitor may see of a finished run: the screen to show next (its own config
 * only), the steps worked through, or that it stopped. Never the document, other config,
 * or a node's error text: a failure answers one generic sentence, a code, and the owner's
 * own note when they wrote one.
 */
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
      // A World ID screen carries a signed request context, so the runtime can open IDKit
      // without holding any World credential; none when the API has no World configuration.
      const action = type === "world.id-verify" ? (config as { action: string }).action : "";
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

/** How an answer to an identity screen turns into the node's outputs, or why it cannot. */
type IdentityOutcome =
  | { resume: Resume }
  | { status: 400 | 401 | 503; error: "invalid_request" | "unauthorized" | "unavailable" };

/**
 * Answers an identity screen from what the API verified, never from what the visitor sent:
 * a Privy token becomes the visitor Privy describes; a World proof becomes the portal's
 * verdict. A host without the provider fails the node as unconfigured, like an AI node
 * without a model, so the owner sees it in the run history.
 */
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
  return { status: 400, error: "invalid_request" };
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
  callsPerMinute = defaultRateLimits.sessions,
  now = Date.now,
  identity,
  world,
}: SessionDependencies) {
  // Visitors are anonymous, so both routes share one window per client address.
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
        // A wrong token and an unknown session look the same, so the id alone leaks nothing.
        if (!row || !tokenMatches(row, body.token)) return status(404, { error: "not_found" });
        if (row.status !== "screen" || row.nodeId === null)
          return status(409, { error: "invalid_request" });
        if (body.nodeId !== row.nodeId) return status(409, { error: "invalid_request" });
        const found = await flows.findPublishedWithOwner(params.id);
        if (!found) return status(404, { error: "not_found" });
        const previous = row.lastRunId ? await runs.find(row.ownerId, row.lastRunId) : null;
        if (!previous || previous.run.flowId !== row.flowId)
          return status(409, { error: "invalid_request" });
        // Continue the session's snapshot, not a graph republished while the visitor paused.
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
            node.type === "world.id-verify" &&
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
