// Voice helpers for the Settings Voice section. Nothing here runs while a page
// renders: the provider's list is fetched only when the section asks for it.
import type { TtsDriver, Voice } from "@/lib/tts/driver";

export const VOICE_LIST_TIMEOUT_MS = 3000;

/** The provider's voices, or [] when there is no driver, it throws, or it takes longer than `timeoutMs`. */
export async function loadVoiceOptions(driver: TtsDriver | null, timeoutMs: number = VOICE_LIST_TIMEOUT_MS): Promise<Voice[]> {
  if (!driver) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<Voice[]>((resolve) => {
      timer = setTimeout(() => resolve([]), timeoutMs);
    });
    return await Promise.race([driver.voices().catch((): Voice[] => []), timeout]);
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  openai_compatible: "OpenAI-compatible server",
  gemini: "Gemini",
  elevenlabs: "ElevenLabs",
  fake: "Test voices",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

// Binary units, like the 2 MB clip cap in the spec.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function storageLine(clips: number, bytes: number): string {
  return `${clips === 1 ? "1 clip" : `${clips} clips`}, ${formatBytes(bytes)}`;
}
