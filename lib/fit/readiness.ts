export type FitReadiness = "ready" | "ai_off" | "no_posting" | "no_resume";

const isBlank = (value: string | null): boolean => value === null || value.trim() === "";

// Checked in this order, so the message names the first thing to fix.
export function fitReadiness(input: { aiOn: boolean; postingMd: string | null; resumeMd: string | null }): FitReadiness {
  if (!input.aiOn) return "ai_off";
  if (isBlank(input.postingMd)) return "no_posting";
  if (isBlank(input.resumeMd)) return "no_resume";
  return "ready";
}
