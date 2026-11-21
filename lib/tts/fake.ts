import { fail, ok } from "@/lib/result";
import { IDEAL_CPS } from "./gate";
import type { TtsDriver, TtsErrorCode, TtsRequest, Voice } from "./driver";

export const FAKE_TTS_WAIT_MAX_MS = 30_000;
const FRAME_BYTES = 208;
const FRAME_MS = 26.122;
const MIN_MS = 600;
const ERROR_CODES: readonly TtsErrorCode[] = ["tts_timeout", "tts_bad_output", "tts_rate_limited", "tts_error"];

// MPEG 1 Layer III, mono, 64 kbps, 44.1 kHz: header FF FB 50 C0, then zeros.
export function silentMp3(durationMs: number): Uint8Array {
  const frames = Math.max(1, Math.ceil(durationMs / FRAME_MS));
  const out = new Uint8Array(frames * FRAME_BYTES);
  for (let i = 0; i < frames; i += 1) out.set([0xff, 0xfb, 0x50, 0xc0], i * FRAME_BYTES);
  return out;
}

export const FAKE_VOICES: Voice[] = [
  { id: "Vivian", label: "Vivian", language: "en" },
  { id: "Ryan", label: "Ryan", language: "en" },
  { id: "Aria", label: "Aria", language: "en" },
];

const WAIT_LINE = /^Fake wait:\s*(\d{1,6})\s*$/im;
const ERROR_LINE = /^Fake error:\s*(\S+)\s*$/im;
const CONTROL_LINES = /^Fake (?:wait|error):.*$/gim;

export function createFakeTtsDriver(options: { sleep?: (ms: number) => Promise<void> } = {}): TtsDriver {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  return {
    name: "fake",
    async synthesize(request: TtsRequest) {
      const wait = WAIT_LINE.exec(request.text)?.[1];
      if (wait !== undefined) await sleep(Math.min(FAKE_TTS_WAIT_MAX_MS, Number(wait)));
      const code = ERROR_LINE.exec(request.text)?.[1];
      if (code !== undefined && (ERROR_CODES as readonly string[]).includes(code)) {
        return fail(code as TtsErrorCode, code);
      }
      const spoken = request.text.replace(CONTROL_LINES, "").trim();
      const durationMs = Math.max(MIN_MS, Math.round((spoken.length / IDEAL_CPS) * 1000));
      return ok({ audio: silentMp3(durationMs), contentType: "audio/mpeg" });
    },
    async voices() {
      return FAKE_VOICES.map((v) => ({ ...v }));
    },
  };
}
