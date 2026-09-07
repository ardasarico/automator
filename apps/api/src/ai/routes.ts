import { explainRunContract, generateFlowContract, Type, Value } from "@automator/contracts";
import { LanguageModelError, type LanguageModel } from "@automator/flow-engine";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import { explainRun } from "./explain-run";
import { FlowGenerationError, generateFlow } from "./generate-flow";

export interface AiDependencies {
  identity: IdentityProvider | undefined;
  /** Absent when no OpenRouter key is configured; the routes then answer 503. */
  model: LanguageModel | undefined;
  log?: boolean;
}

/**
 * `POST /ai/flows` designs or edits a flow document from a prompt and the conversation so
 * far; `POST /ai/runs/explain` explains a failed run. Both sit behind the auth guard and
 * answer 503 without a model, 422 when the model cannot produce a valid answer.
 */
export function createAiRoutes({ identity, model, log = false }: AiDependencies) {
  const attempt = async <T>(what: string, ask: (model: LanguageModel) => Promise<T>) => {
    if (!model) return { status: 503 as const, error: "unavailable" as const };
    try {
      return { status: 200 as const, data: await ask(model) };
    } catch (error) {
      if (log) console.warn(`${what} failed`, error instanceof Error ? error.message : error);
      if (error instanceof FlowGenerationError)
        return { status: 422 as const, error: "invalid_flow" as const };
      if (error instanceof LanguageModelError)
        return { status: 503 as const, error: "unavailable" as const };
      throw error;
    }
  };
  return new Elysia({ name: "ai" })
    .use(createAuthGuard(identity))
    .post(
      generateFlowContract.path,
      async ({ body, status }) => {
        if (!Value.Check(generateFlowContract.body, body))
          return status(400, { error: "invalid_request" });
        const result = await attempt("Flow generation", (model) =>
          generateFlow(model, body.prompt, body.document, body.history),
        );
        return result.status === 200 ? result.data : status(result.status, { error: result.error });
      },
      { body: Type.Unknown(), response: generateFlowContract.response },
    )
    .post(
      explainRunContract.path,
      async ({ body, status }) => {
        if (!Value.Check(explainRunContract.body, body))
          return status(400, { error: "invalid_request" });
        const result = await attempt("Run explanation", (model) => explainRun(model, body));
        return result.status === 200 ? result.data : status(result.status, { error: result.error });
      },
      { body: Type.Unknown(), response: explainRunContract.response },
    );
}
