// Shared by the three network drivers. Messages name the failure kind only:
// never the text, the key or the provider's answer body, because the text is
// the owner's interview answers (spec 7).
import { fail, ok, type Result } from "@/lib/result";
import type { TtsErrorCode } from "./driver";

export const TTS_TIMEOUT_MS = 30_000;
export type TtsDriverOptions = { timeoutMs?: number };

export function errorCodeForStatus(status: number): TtsErrorCode {
  return status === 429 ? "tts_rate_limited" : "tts_error";
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export async function requestBytes(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Result<{ bytes: Uint8Array; contentType: string | null }, TtsErrorCode>> {
  try {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return fail(errorCodeForStatus(response.status), `provider answered ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) return fail("tts_bad_output", "provider returned an empty body");
    return ok({ bytes, contentType: response.headers.get("content-type") });
  } catch (error) {
    return isTimeout(error) ? fail("tts_timeout", "provider timed out") : fail("tts_error", "request failed");
  }
}

// A best-effort JSON read for voice lists: any failure is null.
export async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown | null> {
  try {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
