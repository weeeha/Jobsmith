export const AI_PROVIDERS = ["gateway", "anthropic", "fake"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gateway: "anthropic/claude-haiku-4.5",
  anthropic: "claude-haiku-4-5-20251001",
  fake: "fake-extractor",
};

export type AiConfig =
  | { provider: "gateway"; model: string; apiKey: string | undefined }
  | { provider: "anthropic"; model: string; apiKey: string }
  | { provider: "fake"; model: string };

const MODEL_PATTERN = /^[A-Za-z0-9._:/-]{1,100}$/;

export function parseAiConfig(
  source: Record<string, string | undefined>,
): { ok: true; config: AiConfig | null } | { ok: false; invalid: string[] } {
  const providerRaw = source.AI_PROVIDER;
  // Unset or blank means AI is off, on purpose: a developer's shell
  // ANTHROPIC_API_KEY must never send postings anywhere by accident, so
  // every other AI variable is ignored once this guard fires.
  if (!providerRaw) return { ok: true, config: null };

  if (!(AI_PROVIDERS as readonly string[]).includes(providerRaw)) {
    return { ok: false, invalid: ["AI_PROVIDER"] };
  }
  const provider = providerRaw as AiProvider;

  const invalid: string[] = [];
  let model = DEFAULT_MODELS[provider];
  if (source.AI_MODEL !== undefined) {
    if (!MODEL_PATTERN.test(source.AI_MODEL)) invalid.push("AI_MODEL");
    else model = source.AI_MODEL;
  }

  if (provider === "gateway") {
    const apiKey = source.AI_GATEWAY_API_KEY;
    if (!apiKey && source.VERCEL !== "1") invalid.push("AI_GATEWAY_API_KEY");
    if (invalid.length > 0) return { ok: false, invalid };
    return { ok: true, config: { provider: "gateway", model, apiKey } };
  }
  if (provider === "anthropic") {
    const apiKey = source.ANTHROPIC_API_KEY;
    // Returns as soon as the key is missing, rather than falling through to
    // the shared invalid.length check below: unlike gateway's apiKey (which
    // stays optional in AiConfig), anthropic's must narrow to `string`
    // before it can be used in the config object.
    if (!apiKey) {
      invalid.push("ANTHROPIC_API_KEY");
      return { ok: false, invalid };
    }
    if (invalid.length > 0) return { ok: false, invalid };
    return { ok: true, config: { provider: "anthropic", model, apiKey } };
  }
  if (invalid.length > 0) return { ok: false, invalid };
  return { ok: true, config: { provider: "fake", model } };
}
