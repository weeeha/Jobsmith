import { generateText, Output, NoObjectGeneratedError, type LanguageModel, type JSONValue } from "ai";
import type { AiDriver, AiErrorCode, AiRequest } from "./driver";

export type SdkProviderOptions = Record<string, Record<string, JSONValue>>;

export function createSdkDriver(options: {
  name: "gateway" | "anthropic";
  model: LanguageModel;
  modelId: string;
  providerOptions?: SdkProviderOptions;
}): AiDriver {
  return {
    name: options.name,
    modelId: options.modelId,
    async generate<T>(request: AiRequest<T>) {
      try {
        const result = await generateText({
          model: options.model,
          instructions: request.instructions,
          prompt: request.prompt,
          output: Output.object({ schema: request.schema }),
          maxRetries: 1,
          maxOutputTokens: request.maxOutputTokens,
          timeout: request.timeoutMs,
          providerOptions: options.providerOptions,
        });
        return {
          ok: true as const,
          data: {
            object: result.output as T,
            modelId: options.modelId,
            usage: { inputTokens: result.usage.inputTokens ?? null, outputTokens: result.usage.outputTokens ?? null },
          },
        };
      } catch (error) {
        // NoObjectGeneratedError covers every shape of "the model's reply
        // did not match the schema": missing keys, non-JSON text and an
        // out-of-enum value all throw this one class in ai
        // 7.0.114. A TimeoutError or AbortError is the `timeout` option
        // firing; anything else is an unclassified provider error.
        const code: AiErrorCode = NoObjectGeneratedError.isInstance(error)
          ? "ai_bad_output"
          : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
            ? "ai_timeout"
            : "ai_error";
        return { ok: false as const, code, message: code };
      }
    },
  };
}
