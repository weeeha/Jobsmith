import { randomBytes } from "node:crypto";
import { getStorage } from "@/lib/storage";
import type { Storage } from "@/lib/storage/driver";
import type { TtsDriver } from "@/lib/tts/driver";
import { getTtsDriver } from "@/lib/tts";

// Everything lib/audio/segments.ts needs from the outside world, so tests can
// hand it a fake driver, a memory store and a fixed clock.
export type AudioDeps = {
  tts: TtsDriver | null;
  storage: Storage;
  now(): Date;
  randomHex(bytes: number): string;
};

export function audioDeps(): AudioDeps {
  return {
    tts: getTtsDriver(),
    storage: getStorage(),
    now: () => new Date(),
    randomHex: (bytes) => randomBytes(bytes).toString("hex"),
  };
}
