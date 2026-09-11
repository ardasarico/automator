import {
  answerMiniAppSessionContract,
  flowNodeConfigSchemas,
  flowChainId,
  findScreenFormAnswerProblem,
  isIdentityScreenType,
  isScreenNodeType,
  isTxHash,
  miniAppAnswerSchema,
  failureCode,
  visitorFailureMessage,
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
  type MiniAppAnswer,
  type MiniAppPayment,
  type MiniAppSession,
  type MiniAppStep,
  type ScreenNodeType,
  type UsdcPaymentCollected,
  type UsdcPaymentConfig,
  type WorldSelfieCheck,
  type WorldSelfieRejection,
} from "@automator/contracts";
import type {
  FlowStore,
  MiniAppSessionRow,
  RunStore,
  SessionStore,
  VisitorPaymentRow,
} from "@automator/db";
import {
  parseTokenAmount,
  resolveTemplates,
  screenScope,
  runFlow,
  type ChainProvider,
  type RunOptions,
  type SecretsResolver,
} from "@automator/flow-engine";
import { isAddress, isHex, type Address } from "viem";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import type { IdentityProvider } from "../auth/privy";
import type { ChainFactory } from "../chain/provider";
import { checkVisitorPayment } from "../chain/visitor-payments";
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

export { failureCode };

/** How long the API waits for a visitor's transfer to land before telling them to come back. */
const paymentReceiptTimeoutMs = 60_000;
const ZERO = BigInt(0);

/**
 * The transfer a `usdc.payment` screen asks its visitor for. The document only says how much and,
 * optionally, to whom: the token, its decimals and the owner's own wallet come from the chain the
 * flow runs on, so the API resolves them here and the browser signs numbers it did not invent.
 */
async function resolvePayment(
  config: UsdcPaymentConfig,
  chain: ChainProvider | undefined,
  chainFactory: ChainFactory | undefined,
): Promise<{ payment: MiniAppPayment } | { error: string }> {
  if (!chain || !chainFactory) return { error: "No chain is configured for this run" };
  const configured = chainFactory.chain(chain.chainId);
  const token = configured?.usdcAddress;
  if (!configured || !token)
    return { error: `No USDC contract is configured for ${chain.chainName}` };
  const wanted = config.to.trim();
  const to = wanted || chain.account;
  if (!to || !isAddress(to))
    return {
      error: wanted
        ? "Recipient is not a valid address"
        : "This app has no wallet configured to collect a payment into",
    };
  let decimals: number | null;
  try {
    decimals = await configured.usdcDecimals();
  } catch {
    return { error: `The ${chain.chainName} RPC could not be reached` };
  }
  if (decimals === null) return { error: `No USDC contract is configured for ${chain.chainName}` };
  let units: bigint;
  try {
    units = parseTokenAmount(config.amount, decimals, "Amount");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Amount must be a decimal amount" };
  }
  if (units <= ZERO) return { error: "Amount must be more than zero" };
  return {
    payment: {
      chainId: chain.chainId,
      chainName: chain.chainName,
      token,
      decimals,
      to,
      amount: config.amount.trim(),
      amountUnits: units.toString(),
    },
  };
}

/** Either the payment to serve the screen with, or the reason it cannot be served at all. */
type ScreenExtras = { payment?: MiniAppPayment; failure?: { nodeId: string; error: string } };

/*
 * What the API has to settle before a waiting screen can be shown. Only `usdc.payment` needs it:
 * a screen whose payment cannot be resolved is an app that is not set up to take money, so the
 * node fails and the visitor reads the payment sentence instead of a screen that cannot work.
 */
async function screenExtras(
  document: FlowDocument,
  run: FlowRun,
  scope: ScreenScope,
  chain: ChainProvider | undefined,
  chainFactory: ChainFactory | undefined,
): Promise<ScreenExtras> {
  if (run.status !== "waiting") return {};
  const waiting = run.nodes.find((result) => result.status === "waiting");
  const node = waiting ? document.nodes.find((entry) => entry.id === waiting.nodeId) : undefined;
  if (!node || node.type !== "usdc.payment") return {};
  const config = screenConfig(
    { ...node, type: node.type },
    { ...scope, input: screenScope(document, run, node.id).input },
  ) as UsdcPaymentConfig;
  const resolved = await resolvePayment(config, chain, chainFactory);
  return "error" in resolved
    ? { failure: { nodeId: node.id, error: resolved.error } }
    : { payment: resolved.payment };
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
  payment?: MiniAppPayment,
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
          ...(payment ? { payment } : {}),
        },
      };
    }
  }
  if (run.status === "succeeded") return { sessionId, status: "end", steps };
  const failed = run.nodes.find((result) => result.status === "failed");
  const help = visitorHelp(document);
  const code = failureCode(failed?.error ?? run.error);
  return {
    sessionId,
    status: "failed",
    steps,
    error: visitorFailureMessage(code, failed ? byId.get(failed.nodeId)?.type : undefined),
    code,
    ...(help ? { help } : {}),
  };
}

type Resume = NonNullable<RunOptions["resume"]>;

/** Records a screen the API cannot serve as the failed node it is, keeping the rest of the run. */
function failScreen(
  document: FlowDocument,
  run: FlowRun,
  failure: { nodeId: string; error: string },
  options: RunOptions,
): Promise<FlowRun> {
  return runFlow(document, {
    ...options,
    resume: {
      nodeId: failure.nodeId,
      outputs: {},
      variables: run.variables,
      completed: run.nodes,
      error: failure.error,
    },
  });
}

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

type PaymentOutcome =
  | { resume: Resume }
  | {
      status: 400 | 401 | 409;
      error:
        | "invalid_request"
        | "unauthorized"
        | "payment_claim_lost"
        | "payment_pending"
        | "payment_rejected"
        | "payment_used";
    }
  /** The app itself cannot take money; the node fails and the visitor gets the payment sentence. */
  | { failure: { nodeId: string; error: string } };

/**
 * Turns a visitor's claim that they paid into a verified payment, or into a refusal they can act
 * on. Everything the transfer is checked against is recomputed here — the recipient, the amount,
 * and the wallet of the Privy user whose token came with this answer — so nothing the browser
 * sends decides whether the flow continues. The transfer is recorded in the same step that claims
 * the screen, which is what stops one payment from answering two screens.
 */
async function collectPayment(
  answer: {
    node: FlowNode;
    config: UsdcPaymentConfig;
    body: MiniAppAnswer;
    row: MiniAppSessionRow;
  },
  deps: {
    identity: Pick<IdentityProvider, "visitor"> | undefined;
    chain: ChainProvider | undefined;
    chainFactory: ChainFactory | undefined;
    sessions: SessionStore;
  },
): Promise<PaymentOutcome> {
  const { node, config, body, row } = answer;
  const hash = body.data?.txHash;
  if (!isTxHash(hash) || !isHex(hash)) return { status: 400, error: "invalid_request" };
  if (!body.privyToken) return { status: 400, error: "invalid_request" };
  if (!deps.identity?.visitor)
    return {
      failure: {
        nodeId: node.id,
        error: "Sign-in is not configured on this server: set PRIVY_APP_ID and PRIVY_APP_SECRET",
      },
    };
  const visitor = await deps.identity.visitor(body.privyToken);
  if (!visitor) return { status: 401, error: "unauthorized" };
  if (!isAddress(visitor.wallet)) return { status: 400, error: "payment_rejected" };
  const payer = visitor.wallet as Address;

  const resolved = await resolvePayment(config, deps.chain, deps.chainFactory);
  if ("error" in resolved) return { failure: { nodeId: node.id, error: resolved.error } };
  const { payment } = resolved;
  const configured = deps.chainFactory?.chain(payment.chainId);
  if (!configured)
    return { failure: { nodeId: node.id, error: "No chain is configured for this run" } };

  const receipt = await configured.payments.waitForReceipt(hash, paymentReceiptTimeoutMs);
  // Still pending is not a refusal: the visitor answers again once it lands, on the same screen.
  if (!receipt) return { status: 409, error: "payment_pending" };
  const verdict = checkVisitorPayment(receipt, {
    token: payment.token as Address,
    from: payer,
    to: payment.to as Address,
    units: BigInt(payment.amountUnits),
  });
  if (!verdict.ok) return { status: 400, error: "payment_rejected" };

  const record: VisitorPaymentRow = {
    id: randomUUID(),
    flowId: row.flowId,
    sessionId: row.id,
    runId: row.lastRunId,
    chainId: payment.chainId,
    txHash: hash,
    fromAddress: payer,
    toAddress: payment.to,
    amountUnits: payment.amountUnits,
  };
  const claim = await deps.sessions.claimWithPayment(row, record);
  if (claim === "spent") return { status: 409, error: "payment_used" };
  // The transfer is real but the screen it answers is gone: the visitor must hear that money
  // moved, not that their request was malformed.
  if (claim === "lost") return { status: 409, error: "payment_claim_lost" };

  const collected: UsdcPaymentCollected = {
    paid: true,
    txHash: hash,
    from: payer,
    to: payment.to,
    amount: payment.amount,
    chainId: payment.chainId,
  };
  return {
    resume: {
      nodeId: node.id,
      outputs: { [screenPorts("usdc.payment").primary]: collected },
      variables: row.variables,
    },
  };
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
        const chain = chainFactory
          ? await chainFactory.forUser(found.ownerId, "live", flowChainId(document))
          : undefined;
        const options: RunOptions = {
          ...engine,
          signal: request.signal,
          trigger: { nodeId: entry.id, payload },
          secrets: secretsFor?.(found.ownerId),
          chain,
          data: dataFactory?.forOwner(found.ownerId, "live"),
        };
        let run = await runFlow(document, options);
        const scope = { vars: run.variables, trigger: payload };
        const extras = await screenExtras(document, run, scope, chain, chainFactory);
        if (extras.failure) run = await failScreen(document, run, extras.failure, options);
        await runs.create(found.ownerId, document, run, "miniapp");
        const sessionId = randomUUID();
        const token = randomBytes(24).toString("base64url");
        const session = toSession(
          sessionId,
          document,
          run,
          { vars: run.variables, trigger: payload },
          world,
          extras.payment,
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
        const input = screenScope(document, previous.run, node.id).input;
        // Provider failures before execution remain retryable. Claim the screen only once
        // every prerequisite is ready, before any node can send a message or transaction.
        const chain = chainFactory
          ? await chainFactory.forUser(found.ownerId, "live", flowChainId(document))
          : undefined;
        const options: RunOptions = {
          ...engine,
          signal: request.signal,
          trigger: { payload: row.payload },
          secrets: secretsFor?.(found.ownerId),
          chain,
          data: dataFactory?.forOwner(found.ownerId, "live"),
        };

        let resume: Resume;
        if (node.type === "usdc.payment") {
          const config = screenConfig(
            { ...node, type: node.type },
            { vars: row.variables, trigger: row.payload, input },
          ) as UsdcPaymentConfig;
          if (body.port === (ports.secondary ?? ports.primary)) {
            resume = {
              nodeId: node.id,
              outputs: { [body.port]: { paid: false } },
              variables: row.variables,
            };
            if (!(await sessions.claim(row))) return status(409, { error: "invalid_request" });
          } else {
            const outcome = await collectPayment(
              { node, config, body, row },
              { identity, chain, chainFactory, sessions },
            );
            if ("status" in outcome) return status(outcome.status, { error: outcome.error });
            if ("failure" in outcome) {
              const run = await failScreen(document, previous.run, outcome.failure, options);
              await runs.create(found.ownerId, document, run, "miniapp");
              const failed = toSession(
                row.id,
                document,
                run,
                { vars: run.variables, trigger: row.payload },
                world,
              );
              await sessions.update(row.id, {
                status: failed.status,
                nodeId: null,
                variables: run.variables,
                lastRunId: run.id,
                worldNonce: null,
                worldExpiresAt: null,
              });
              return failed;
            }
            resume = outcome.resume;
          }
        } else if (isIdentityScreenType(node.type)) {
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
          const outcome = await answerIdentityScreen(node, body, row, { identity, world }, input);
          if (!("resume" in outcome)) return status(outcome.status, { error: outcome.error });
          resume = outcome.resume;
          if (!(await sessions.claim(row))) return status(409, { error: "invalid_request" });
        } else {
          if (node.type === "screen.form") {
            const config = resolveTemplates(parseScreenConfig(node.type, node.config), {
              input,
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
          if (!(await sessions.claim(row))) return status(409, { error: "invalid_request" });
        }
        let run = await runFlow(document, {
          ...options,
          resume: { ...resume, completed: previous.run.nodes },
        });
        const scope = { vars: run.variables, trigger: row.payload };
        const extras = await screenExtras(document, run, scope, chain, chainFactory);
        if (extras.failure) run = await failScreen(document, run, extras.failure, options);
        await runs.create(found.ownerId, document, run, "miniapp");
        const session = toSession(
          row.id,
          document,
          run,
          { vars: run.variables, trigger: row.payload },
          world,
          extras.payment,
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
