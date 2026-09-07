import {
  classifyConfigSchema,
  extractConfigSchema,
  generateTextConfigSchema,
} from "@automator/contracts";
import { runAgent } from "./agent";
import { NodeExecutionError, type ExecutionContext, type ExecutorRegistry } from "./executor";
import { matchesJsonSchema, type JsonSchema } from "./json-schema";
import { parseJsonAnswer, type ChatMessage, type LanguageModel } from "./language-model";

export function requireModel(context: ExecutionContext): LanguageModel {
  if (!context.model)
    throw new NodeExecutionError(
      "No language model is configured; set OPENROUTER_API_KEY or OPENAI_API_KEY",
    );
  return context.model;
}

/** A system message when there are instructions, then the user turn. */
export function chat(instructions: string, user: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (instructions.trim()) messages.push({ role: "system", content: instructions });
  messages.push({ role: "user", content: user });
  return messages;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

export const aiExecutors: ExecutorRegistry = {
  "ai.generate-text": {
    kind: "step",
    async run(context) {
      const model = requireModel(context);
      const { prompt, instructions } = context.config(generateTextConfigSchema);
      const text = asText(prompt);
      if (!text.trim()) throw new NodeExecutionError("Generate text needs a prompt");
      const answer = await model({ messages: chat(instructions, text) });
      return { text: answer.content ?? "" };
    },
  },

  "ai.classify": {
    kind: "step",
    async run(context) {
      const model = requireModel(context);
      const { text, labels, instructions } = context.config(classifyConfigSchema);
      const cleaned = labels.map((label) => label.trim()).filter(Boolean);
      if (cleaned.length === 0) throw new NodeExecutionError("Classify needs at least one label");
      const content = asText(text);
      const answer = await model({
        messages: chat(
          `${instructions}\nClassify the user's text into exactly one of these labels: ${cleaned.join(", ")}. Answer with JSON {"label": ...}.`,
          content,
        ),
        responseFormat: {
          type: "json_schema",
          name: "classification",
          schema: {
            type: "object",
            properties: { label: { type: "string", enum: cleaned } },
            required: ["label"],
            additionalProperties: false,
          },
        },
        temperature: 0,
      });
      const parsed = parseJsonAnswer(answer.content) as { label?: unknown };
      const label = typeof parsed.label === "string" ? parsed.label : undefined;
      if (!label || !cleaned.includes(label))
        throw new NodeExecutionError(
          `The model answered with an unknown label: ${asText(parsed.label)}`,
        );
      // The label also fires a handle of its own name, so per-label ports can be added later.
      return { label, [label]: content };
    },
  },

  "ai.extract": {
    kind: "step",
    async run(context) {
      const model = requireModel(context);
      const { text, schema, instructions } = context.config(extractConfigSchema);
      let parsedSchema: JsonSchema;
      try {
        parsedSchema = JSON.parse(schema);
      } catch {
        throw new NodeExecutionError("Extract data needs a valid JSON schema");
      }
      const answer = await model({
        messages: chat(
          `${instructions}\nExtract the data described by this JSON schema from the user's text and answer with JSON only:\n${schema}`,
          asText(text),
        ),
        responseFormat: { type: "json_schema", name: "extraction", schema: parsedSchema },
        temperature: 0,
      });
      const data = parseJsonAnswer(answer.content);
      if (!matchesJsonSchema(parsedSchema, data))
        throw new NodeExecutionError("The model's answer does not match the schema");
      return { data };
    },
  },

  "ai.agent": {
    kind: "step",
    async run(context) {
      return runAgent(context);
    },
  },
};
