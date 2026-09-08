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

function trigger(outputHandle: string): NodeExecutor {
  return { kind: "trigger", run: async ({ trigger }) => ({ [outputHandle]: trigger }) };
}

const screen: NodeExecutor = { kind: "screen" };

export const defaultExecutors: ExecutorRegistry = {
  "trigger.schedule": trigger("tick"),
  "trigger.onchain-event": trigger("event"),
  "trigger.price": trigger("price"),
  "trigger.balance": trigger("balance"),
  "trigger.webhook": trigger("request"),
  "trigger.miniapp-open": trigger("visitor"),
  "trigger.manual": trigger("run"),
  "world.verification-completed": trigger("proof"),

  "screen.page": screen,
  "screen.form": screen,
  "screen.confirmation": screen,
  "screen.qr-code": screen,
  "privy.login": screen,
  "world.id-verify": screen,

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

export { compare } from "./compare";
