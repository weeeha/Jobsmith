import type { AiDriver, AiErrorCode, AiRequest, AiTask } from "./driver";
import type { PostingFields } from "@/lib/intake/values";

export const FAKE_MODEL_ID = "fake-extractor";
export type FakeHandler = (request: AiRequest<unknown>) => unknown | { error: AiErrorCode };

export function fakeExtractFields(prompt: string): PostingFields {
  const body = /<posting>\n([\s\S]*)\n<\/posting>/.exec(prompt)?.[1] ?? prompt;
  const line = (label: string) => new RegExp(`^${label}:\\s*(.+)$`, "im").exec(body)?.[1]?.trim() ?? null;
  const mode = line("Work mode")?.toLowerCase();
  return {
    companyName: line("Company"),
    roleTitle: line("Role"),
    location: line("Location"),
    workMode: mode === "remote" || mode === "hybrid" || mode === "onsite" ? mode : null,
    compMin: null,
    compMax: null,
    compCurrency: null,
  };
}

function isErrorResult(value: unknown): value is { error: AiErrorCode } {
  return typeof value === "object" && value !== null && "error" in value;
}

export function createFakeDriver(handlers?: Partial<Record<AiTask, FakeHandler>>): AiDriver & { calls: AiRequest<unknown>[] } {
  const calls: AiRequest<unknown>[] = [];
  return {
    name: "fake",
    modelId: FAKE_MODEL_ID,
    calls,
    async generate<T>(request: AiRequest<T>) {
      calls.push(request as AiRequest<unknown>);
      const handler = handlers?.[request.task];
      const raw = handler ? handler(request as AiRequest<unknown>) : fakeExtractFields(request.prompt);
      if (isErrorResult(raw)) {
        return { ok: false as const, code: raw.error, message: raw.error };
      }
      const parsed = request.schema.safeParse(raw);
      if (!parsed.success) {
        return { ok: false as const, code: "ai_bad_output" as const, message: "ai_bad_output" };
      }
      return {
        ok: true as const,
        data: { object: parsed.data, modelId: FAKE_MODEL_ID, usage: { inputTokens: null, outputTokens: null } },
      };
    },
  };
}
