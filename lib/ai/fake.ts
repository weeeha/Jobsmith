import type { AiDriver, AiErrorCode, AiRequest, AiTask } from "./driver";
import type { PostingFields } from "@/lib/intake/values";
import type { ScoreOutput } from "./score-fit";

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

export const FAKE_SCORE_DEFAULT = 64;

/**
 * A deterministic score for tests and the end to end server. Only the
 * <posting> text is read, so a line in the resume cannot steer it:
 * `Fit score: 81` gives 81, `Fit score: fail` gives an error, anything else 64.
 */
export function fakeScoreFit(prompt: string): ScoreOutput | { error: AiErrorCode } {
  const posting = /<posting>\n([\s\S]*?)\n<\/posting>/.exec(prompt)?.[1] ?? "";
  const value = /^Fit score:\s*(\S+)\s*$/im.exec(posting)?.[1]?.toLowerCase();
  if (value === "fail") return { error: "ai_error" };
  const score = value !== undefined && /^\d{1,3}$/.test(value) ? Math.min(100, Number(value)) : FAKE_SCORE_DEFAULT;
  return {
    score,
    summary: "A test score from the fake driver.",
    pros: ["The role matches your titles."],
    cons: ["The posting does not state pay."],
  };
}

// One default per task. Typed as a full record so that adding a task to
// AI_TASKS without a fake default fails the type check.
export const FAKE_DEFAULTS: Record<AiTask, FakeHandler> = {
  extract_posting: (request) => fakeExtractFields(request.prompt),
  score_fit: (request) => fakeScoreFit(request.prompt),
};

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
      const handler = handlers?.[request.task] ?? FAKE_DEFAULTS[request.task];
      const raw = handler(request as AiRequest<unknown>);
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
