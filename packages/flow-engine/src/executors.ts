import {
  conditionConfigSchema,
  discordMessageConfigSchema,
  setVariableConfigSchema,
  waitConfigSchema,
} from "@automator/contracts";
import { aiExecutors } from "./ai-executors";
import { compare } from "./compare";
import { logicExecutors } from "./logic-executors";
import { loopExecutors } from "./loop-executors";
import { notifyExecutors } from "./notify-executors";
import { onchainExecutors } from "./onchain-executors";
import { postDiscordMessage } from "./discord";
import { NodeExecutionError, type ExecutorRegistry, type NodeExecutor } from "./executor";

/** A trigger hands its payload to its single output handle. */
function trigger(outputHandle: string): NodeExecutor {
  return { kind: "trigger", run: async ({ trigger }) => ({ [outputHandle]: trigger }) };
}

const screen: NodeExecutor = { kind: "screen" };

/** Executors for every node type the engine runs today. Absent types fail as not implemented. */
export const defaultExecutors: ExecutorRegistry = {
  "trigger.schedule": trigger("tick"),
  "trigger.onchain-event": trigger("event"),
  "trigger.webhook": trigger("request"),
  "trigger.miniapp-open": trigger("visitor"),
  "trigger.manual": trigger("run"),
  "world.verification-completed": trigger("proof"),

  "screen.page": screen,
  "screen.form": screen,
  "screen.confirmation": screen,
  "screen.qr-code": screen,

  "logic.condition": {
    kind: "step",
    async run(context) {
      const { left, operator, right } = context.config(conditionConfigSchema);
      const value = context.inputs.value;
      return compare(left, operator, right) ? { true: value } : { false: value };
    },
  },

  "logic.set-variable": {
    kind: "step",
    async run(context) {
      const { name, value } = context.config(setVariableConfigSchema);
      if (!name) throw new NodeExecutionError("Set variable needs a variable name");
      context.variables[name] = value;
      return { value };
    },
  },

  "logic.wait": {
    kind: "step",
    async run(context) {
      const { seconds } = context.config(waitConfigSchema);
      await context.sleep(seconds * 1000);
      return { done: context.inputs.in };
    },
  },

  "notify.discord": {
    kind: "step",
    async run(context) {
      const { webhookUrl, content, username } = context.config(discordMessageConfigSchema);
      return { sent: await postDiscordMessage(context.fetch, webhookUrl, content, username) };
    },
  },

  ...aiExecutors,
  ...logicExecutors,
  ...onchainExecutors,
  ...notifyExecutors,
  ...loopExecutors,
};

/** Kept for callers that import `compare` from here; it lives in ./compare. */
export { compare } from "./compare";
