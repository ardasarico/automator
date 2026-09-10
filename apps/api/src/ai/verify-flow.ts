import {
  aiFlowTestSchema,
  flowNodePorts,
  isScreenNodeType,
  parseSamplePayload,
  parseScreenConfig,
  templateReferences,
  Type,
  Value,
  visitorAnswer,
  type AiFlowExpectation,
  type AiFlowTest,
  type ConditionOperator,
  type AiVerification,
  type FlowDocumentInput,
  type FlowRun,
  type FlowNodeType,
} from "@automator/contracts";
import type { FixtureTable } from "@automator/flow-engine";
import {
  compare,
  ComparisonError,
  defaultExecutors,
  hasFixture,
  lookupPath,
  nodeFixture,
  resolveTemplates,
  runFlow,
  screenScope,
  type ExecutorRegistry,
  type RunOptions,
} from "@automator/flow-engine";
import { isDeepStrictEqual } from "node:util";
import { createQuickJsSandbox } from "../sandbox/quickjs";

/** A model may author at most this many scenarios, and each one runs under its own clock. */
export const maxTestScenarios = 6;
export const scenarioTimeoutMs = 3000;
/**
 * The ceiling across every check for one attempt, including a second pass without the model's
 * scenarios. The per-scenario timeout stays as the inner guard; this bounds the whole thing, so
 * the checks can never eat the budget the model needs to answer. They run in a local sandbox and
 * finish in milliseconds, so this is a backstop rather than a working limit.
 */
export const verificationBudgetMs = 10_000;

const testListSchema = Type.Array(aiFlowTestSchema, { maxItems: maxTestScenarios });
const pureTypes = new Set<FlowNodeType>([
  "logic.condition",
  "logic.set-variable",
  "logic.wait",
  "logic.merge",
  "logic.switch",
  "logic.filter",
  "logic.run-code",
  "screen.page",
  "screen.form",
  "screen.confirmation",
  "screen.qr-code",
]);
const blockedPrefix = "Not tested: ";

/**
 * A problem in the model-authored scenarios themselves rather than in the flow: an expectation
 * naming a node or output that does not exist, an answer for a screen that is never shown. The
 * flow may still be perfectly good, so the caller degrades to a warning instead of discarding it.
 */
export class FlowTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowTestError";
  }
}

/**
 * The checks ran past their total budget. A FlowTestError by inheritance, deliberately: a draft
 * must never be discarded because its checks were slow, any more than because they were malformed.
 */
export class VerificationTimeoutError extends FlowTestError {
  constructor(message: string) {
    super(message);
    this.name = "VerificationTimeoutError";
  }
}

const comparisonKeys = ["equals", "greaterThan", "lessThan", "contains"] as const;

/** The comparisons an expectation actually states; none means "this output was produced". */
function comparisonsOf(expectation: AiFlowExpectation): string[] {
  return comparisonKeys.filter((key) =>
    key === "equals" ? Object.hasOwn(expectation, key) : expectation[key] !== undefined,
  );
}

/**
 * Every template a node's own config reads has to resolve, whatever runs the node. A binding
 * that points nowhere is a wiring fault the checks exist to find.
 */
function requireResolvableConfig(context: {
  node: { id: string; config: Record<string, unknown> };
  inputs: Record<string, unknown>;
  variables: Record<string, unknown>;
  trigger: unknown;
}): void {
  const scope = { input: context.inputs, vars: context.variables, trigger: context.trigger };
  for (const ref of templateReferences(context.node.config)) {
    if (isSecretReference(ref.reference)) continue;
    if (lookupPath(scope, ref.reference) === undefined)
      throw new Error(
        `${context.node.id}.${ref.path}: missing value for {{${ref.reference}}}. Supply representative test data or fix the binding.`,
      );
  }
}

/**
 * Only local executors may run. A node that reaches a service is replaced: by its fixture where
 * one exists, so the flow after it is genuinely exercised, and otherwise by a stub that fails
 * closed and is reported as untested. `stoodIn` collects the types that were replaced, because a
 * report that does not say so would read as proof of delivery.
 */
function isolatedExecutors(
  stoodIn: Set<FlowNodeType>,
  tables: readonly FixtureTable[],
): ExecutorRegistry {
  const executors: ExecutorRegistry = {};
  for (const [type, executor] of Object.entries(defaultExecutors)) {
    if (!executor) continue;
    const nodeType = type as FlowNodeType;
    if (executor.kind === "trigger" || (pureTypes.has(nodeType) && executor.kind === "screen")) {
      executors[nodeType] = executor;
    } else if (pureTypes.has(nodeType) && executor.kind === "step") {
      executors[nodeType] = {
        kind: "step",
        run: async (context) => {
          requireResolvableConfig(context);
          return executor.run(context);
        },
      };
    } else if (hasFixture(nodeType)) {
      executors[nodeType] = {
        kind: "step",
        run: async (context) => {
          requireResolvableConfig(context);
          // A data node naming a table the owner does not have has nothing honest to answer with.
          const fixture = nodeFixture(nodeType, context.node.config, tables);
          if (fixture === undefined)
            throw new Error(
              `${blockedPrefix}${nodeType} names a table this account does not have.`,
            );
          stoodIn.add(nodeType);
          // The fixture replaces the executor outright, so nothing here can reach the network.
          return fixture;
        },
      };
    } else {
      executors[nodeType] = {
        kind: "step",
        run: async () => {
          throw new Error(
            `${blockedPrefix}${type} requires an external service or verified identity.`,
          );
        },
      };
    }
  }
  return executors;
}

/**
 * A `{{secrets.x}}` placeholder is correct authoring, not a missing value: the API resolves it
 * from the owner's stored secrets when the flow runs, and the builder blanks secret fields before
 * the model ever sees them. The checks have no secrets and are not entitled to any.
 */
function isSecretReference(reference: string): boolean {
  return reference.startsWith("secrets.");
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path ? path.split(".") : []) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export async function verifyFlow(
  input: FlowDocumentInput,
  rawTests?: unknown,
  /** Wall-clock instant the checks must stop by; the caller shares one across both passes. */
  deadline?: number,
  /** The owner's tables, so a data node's record carries that table's real columns. */
  tables: readonly FixtureTable[] = [],
): Promise<AiVerification> {
  if (rawTests !== undefined && !Value.Check(testListSchema, rawTests))
    throw new FlowTestError(
      "tests must contain at most 6 named scenarios, each with at least one expectation.",
    );
  const tests = (rawTests ?? []) as AiFlowTest[];
  const document = { ...input, id: "ai-verification" };
  if (document.nodes.length > 80) throw new Error("AI proposals are limited to 80 nodes.");
  const warnings = new Set<string>();
  const checks: AiVerification["checks"] = [];
  const triggers = document.nodes.filter((node) => flowNodePorts[node.type].inputs.length === 0);
  const scenarios: AiFlowTest[] = tests.length
    ? tests
    : triggers.slice(0, maxTestScenarios).map((node) => ({
        name: `Sample: ${node.label}`,
        triggerNodeId: node.id,
        payload: parseSamplePayload(node.config),
        expect: [],
      }));
  if (!tests.length)
    warnings.add("Sample execution only; no model-authored behavioral expectations were supplied.");
  if (document.nodes.some((node) => node.type === "logic.run-code"))
    warnings.add("Run code requires the server sandbox; browser preview cannot execute it.");
  if (document.nodes.some((node) => node.type === "logic.for-each")) {
    return {
      checks: scenarios.map((s) => ({
        name: s.name,
        status: "skipped",
        detail: "Loop execution is not covered by automatic checks.",
      })),
      warnings: [...warnings],
    };
  }
  const sandbox = document.nodes.some((node) => node.type === "logic.run-code")
    ? createQuickJsSandbox()
    : undefined;
  const reached = new Set<string>();
  const stoodIn = new Set<FlowNodeType>();
  const remaining = () => (deadline === undefined ? scenarioTimeoutMs : deadline - Date.now());
  for (const scenario of scenarios) {
    if (remaining() <= 0)
      throw new VerificationTimeoutError(
        `the checks stopped after ${checks.length} of ${scenarios.length} scenarios.`,
      );
    const trigger = scenario.triggerNodeId
      ? triggers.find((node) => node.id === scenario.triggerNodeId)
      : triggers[0];
    if (!trigger) throw new FlowTestError(`${scenario.name}: unknown trigger.`);
    for (const expectation of scenario.expect) {
      const node = document.nodes.find((node) => node.id === expectation.nodeId);
      if (!node)
        throw new FlowTestError(
          `${scenario.name}: expectation names unknown node ${expectation.nodeId}.`,
        );
      if (
        expectation.output === undefined &&
        (expectation.path !== undefined || comparisonsOf(expectation).length > 0)
      )
        throw new FlowTestError(`${scenario.name}: value expectations require an output.`);
      if (
        expectation.output !== undefined &&
        !flowNodePorts[node.type].outputs.includes(expectation.output)
      )
        throw new FlowTestError(
          `${scenario.name}: unknown output ${expectation.output} on ${node.id}.`,
        );
    }
    const options: RunOptions = {
      executors: isolatedExecutors(stoodIn, tables),
      sandbox,
      fetch: (async () => {
        throw new Error("Automatic checks never access the network.");
      }) as unknown as typeof fetch,
      sleep: async () => {},
      signal: AbortSignal.timeout(Math.min(scenarioTimeoutMs, remaining())),
      trigger: {
        nodeId: trigger.id,
        payload: scenario.payload ?? parseSamplePayload(trigger.config),
      },
    };
    const rendered = new Map<string, string>();
    const answered = new Set<string>();
    let run: FlowRun = await runFlow(document, options);
    for (let step = 0; run.status === "waiting" && step < 16; step++) {
      const waiting = run.nodes.find((node) => node.status === "waiting")!;
      const node = document.nodes.find((node) => node.id === waiting.nodeId)!;
      if (!isScreenNodeType(node.type)) break;
      const scope = screenScope(document, run, node.id);
      for (const ref of templateReferences(node.config)) {
        if (isSecretReference(ref.reference)) continue;
        if (lookupPath(scope, ref.reference) === undefined)
          throw new Error(
            `${scenario.name}: ${node.id}.${ref.path} has no value for {{${ref.reference}}}.`,
          );
      }
      const config = resolveTemplates(parseScreenConfig(node.type, node.config), scope) as Record<
        string,
        unknown
      >;
      rendered.set(node.id, String(config.body ?? config.message ?? ""));
      reached.add(node.id);
      const explicit = scenario.answers?.[node.id];
      const port =
        explicit?.port ??
        (node.type === "screen.form"
          ? "submitted"
          : node.type === "screen.confirmation"
            ? String(config.simulate)
            : "next");
      if (!flowNodePorts[node.type].outputs.includes(port))
        throw new FlowTestError(`${scenario.name}: invalid answer port ${port} on ${node.id}.`);
      let data = explicit?.data;
      if (node.type === "screen.form") {
        const fields = (config.fields ?? []) as {
          id: string;
          sample: string;
          type: string;
          required: boolean;
        }[];
        data =
          data ??
          Object.fromEntries(
            fields.map((field) => [
              field.id,
              field.sample ||
                (field.type === "number"
                  ? "1"
                  : field.type === "email"
                    ? "visitor@example.com"
                    : "Sample"),
            ]),
          );
        for (const field of fields) {
          const value = data[field.id];
          if (field.required && !value?.trim())
            throw new FlowTestError(
              `${scenario.name}: required form field ${field.id} has no test answer.`,
            );
          if (field.type === "number" && value && !Number.isFinite(Number(value)))
            throw new FlowTestError(`${scenario.name}: ${field.id} needs a numeric answer.`);
        }
      }
      answered.add(node.id);
      run = await runFlow(document, {
        ...options,
        resume: {
          nodeId: node.id,
          outputs: { [port]: visitorAnswer(port, data) },
          variables: run.variables,
          completed: run.nodes,
        },
      });
    }
    if (run.status === "waiting")
      throw new Error(`${scenario.name}: exceeds the 16-screen automatic test limit.`);
    const failure = run.nodes.find((node) => node.status === "failed");
    let skippedDetail: string | undefined;
    if (failure || run.status === "failed") {
      const detail = failure?.error ?? run.error ?? "Run failed";
      const failedNode = document.nodes.find((node) => node.id === failure?.nodeId);
      const blocked =
        failedNode &&
        defaultExecutors[failedNode.type]?.kind !== "trigger" &&
        !pureTypes.has(failedNode.type) &&
        detail.startsWith(blockedPrefix);
      if (blocked || (!tests.length && detail.includes("missing value"))) skippedDetail = detail;
      else throw new Error(`${scenario.name}: ${failure?.nodeId ?? "flow"}: ${detail}`);
    }
    for (const result of run.nodes) if (result.status === "succeeded") reached.add(result.nodeId);
    for (const id of Object.keys(scenario.answers ?? {}))
      if (!answered.has(id) && !skippedDetail)
        throw new FlowTestError(`${scenario.name}: answer for ${id} was never used.`);
    for (const expectation of scenario.expect) {
      const result = run.nodes.find((node) => node.nodeId === expectation.nodeId);
      if (!result || result.status !== "succeeded") {
        if (skippedDetail) continue;
        throw new Error(`${scenario.name}: expected ${expectation.nodeId} to be reached.`);
      }
      if (expectation.output) {
        const where = `${expectation.nodeId}.${expectation.output}${expectation.path ? `.${expectation.path}` : ""}`;
        const actual = readPath(result.outputs?.[expectation.output], expectation.path ?? "");
        const got = `got ${JSON.stringify(actual)}`;
        /*
         * An operand the engine cannot order — an object, a blank field, a word — means the
         * expectation named the wrong value, not that the flow misbehaved, so it degrades with
         * the rest of the model's bookkeeping instead of discarding the draft.
         */
        const check = (operator: ConditionOperator, right: unknown, wanted: string) => {
          try {
            if (compare(actual, operator, right)) return;
          } catch (error) {
            if (error instanceof ComparisonError)
              throw new FlowTestError(`${scenario.name}: ${where}: ${error.message}`);
            throw error;
          }
          throw new Error(`${scenario.name}: ${where} expected ${wanted}, ${got}.`);
        };
        // No comparison still asserts something real: the run produced a value here.
        if (actual === undefined) throw new Error(`${scenario.name}: ${where} produced no value.`);
        if (Object.hasOwn(expectation, "equals") && !isDeepStrictEqual(actual, expectation.equals))
          throw new Error(
            `${scenario.name}: ${where} expected ${JSON.stringify(expectation.equals)}, ${got}.`,
          );
        /*
         * The ordering and containment operators are the engine's own, so an expectation asks
         * the same question `logic.condition` answers at run time — including numeric strings,
         * bigints and array membership — and cannot pass while the flow takes the other branch.
         * `equals` stays deep equality: an expectation claims a value, not a loose match.
         */
        if (expectation.greaterThan !== undefined)
          check(
            "greater_than",
            expectation.greaterThan,
            `a number above ${expectation.greaterThan}`,
          );
        if (expectation.lessThan !== undefined)
          check("less_than", expectation.lessThan, `a number below ${expectation.lessThan}`);
        if (expectation.contains !== undefined)
          check(
            "contains",
            expectation.contains,
            `to contain ${JSON.stringify(expectation.contains)}`,
          );
      }
      if (
        expectation.screenBody !== undefined &&
        rendered.get(expectation.nodeId) !== expectation.screenBody
      )
        throw new Error(
          `${scenario.name}: ${expectation.nodeId} screen text did not match the expected text.`,
        );
    }
    checks.push({
      name: scenario.name,
      status: skippedDetail ? "skipped" : "passed",
      detail:
        skippedDetail ??
        (scenario.expect.length
          ? `${scenario.expect.length} model-authored expectations passed.`
          : "Sample path completed; behavior was not asserted."),
    });
  }
  const uncovered = document.nodes.filter(
    (node) => !reached.has(node.id) && flowNodePorts[node.type].inputs.length > 0,
  );
  if (uncovered.length)
    warnings.add(`Not exercised: ${uncovered.map((node) => node.label).join(", ")}.`);
  if (stoodIn.size)
    warnings.add(
      `Stood in for ${[...stoodIn].sort().join(", ")}: the wiring around them was checked, the real delivery, payment or onchain effect was not.`,
    );
  return { checks, warnings: [...warnings] };
}
