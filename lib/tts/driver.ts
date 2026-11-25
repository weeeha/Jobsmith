// Types and constants only. Imports nothing but the Result type, so lib/audio
// and the CLI bundle can import it without the database or Next.
import type { Result } from "@/lib/result";

export type TtsStyle = "default" | "strict";
export type TtsErrorCode = "tts_timeout" | "tts_bad_output" | "tts_rate_limited" | "tts_error";
export type TtsRequest = { text: string; voice: string; style: TtsStyle; format: "mp3" | "wav" };
export type TtsAudio = { audio: Uint8Array; contentType: string; sampleRate?: number };
export type Voice = { id: string; label: string; language: string | null };

export interface TtsDriver {
  name: string;
  synthesize(request: TtsRequest): Promise<Result<TtsAudio, TtsErrorCode>>;
  voices(): Promise<Voice[]>;
}

// Part of every segment hash: bump it when the spoken-text rules change, so
// old clips are not reused for text that would now be read differently.
export const TTS_STYLE_ID = "v1";
export const STRICT_INSTRUCTION = "Read every sentence to the end";
