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
  type AiFlowTest,
  type AiVerification,
  type FlowDocumentInput,
  type FlowRun,
  type FlowNodeType,
} from "@automator/contracts";
import {
  defaultExecutors,
  lookupPath,
  resolveTemplates,
  runFlow,
  screenScope,
  type ExecutorRegistry,
  type RunOptions,
} from "@automator/flow-engine";
import { isDeepStrictEqual } from "node:util";
import { createQuickJsSandbox } from "../sandbox/quickjs";

const testListSchema = Type.Array(aiFlowTestSchema, { maxItems: 6 });
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

/** Only these local executors may run: new or external node types fail closed. */
function isolatedExecutors(): ExecutorRegistry {
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
          const scope = {
            input: context.inputs,
            vars: context.variables,
            trigger: context.trigger,
          };
          for (const ref of templateReferences(context.node.config)) {
            if (lookupPath(scope, ref.reference) === undefined)
              throw new Error(
                `${context.node.id}.${ref.path}: missing value for {{${ref.reference}}}. Supply representative test data or fix the binding.`,
              );
          }
          return executor.run(context);
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
): Promise<AiVerification> {
  if (rawTests !== undefined && !Value.Check(testListSchema, rawTests))
    throw new Error(
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
    : triggers.slice(0, 6).map((node) => ({
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
  for (const scenario of scenarios) {
    const trigger = scenario.triggerNodeId
      ? triggers.find((node) => node.id === scenario.triggerNodeId)
      : triggers[0];
    if (!trigger) throw new Error(`${scenario.name}: unknown trigger.`);
    for (const expectation of scenario.expect) {
      const node = document.nodes.find((node) => node.id === expectation.nodeId);
      if (!node)
        throw new Error(`${scenario.name}: expectation names unknown node ${expectation.nodeId}.`);
      if (
        expectation.output === undefined &&
        (expectation.path !== undefined || Object.hasOwn(expectation, "equals"))
      )
        throw new Error(`${scenario.name}: value expectations require an output.`);
      if (
        expectation.output !== undefined &&
        !flowNodePorts[node.type].outputs.includes(expectation.output)
      )
        throw new Error(`${scenario.name}: unknown output ${expectation.output} on ${node.id}.`);
      if (expectation.output !== undefined && !Object.hasOwn(expectation, "equals"))
        throw new Error(`${scenario.name}: output expectations require equals.`);
    }
    const options: RunOptions = {
      executors: isolatedExecutors(),
      sandbox,
      fetch: (async () => {
        throw new Error("Automatic checks never access the network.");
      }) as unknown as typeof fetch,
      sleep: async () => {},
      signal: AbortSignal.timeout(3000),
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
        throw new Error(`${scenario.name}: invalid answer port ${port} on ${node.id}.`);
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
            throw new Error(
              `${scenario.name}: required form field ${field.id} has no test answer.`,
            );
          if (field.type === "number" && value && !Number.isFinite(Number(value)))
            throw new Error(`${scenario.name}: ${field.id} needs a numeric answer.`);
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
        throw new Error(`${scenario.name}: answer for ${id} was never used.`);
    for (const expectation of scenario.expect) {
      const result = run.nodes.find((node) => node.nodeId === expectation.nodeId);
      if (!result || result.status !== "succeeded") {
        if (skippedDetail) continue;
        throw new Error(`${scenario.name}: expected ${expectation.nodeId} to be reached.`);
      }
      if (expectation.output) {
        const actual = readPath(result.outputs?.[expectation.output], expectation.path ?? "");
        if (!isDeepStrictEqual(actual, expectation.equals))
          throw new Error(
            `${scenario.name}: ${expectation.nodeId}.${expectation.output}.${expectation.path ?? ""} expected ${JSON.stringify(expectation.equals)}, got ${JSON.stringify(actual)}.`,
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
  return { checks, warnings: [...warnings] };
}
