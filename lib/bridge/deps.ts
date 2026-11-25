import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import { getStorage } from "@/lib/storage";
import type { BridgeDeps } from "./handlers";

export function productionDeps(): BridgeDeps {
  return {
    db: getDb(),
    now: () => new Date(),
    revalidate: (path) => revalidatePath(path),
    requestId: () => crypto.randomUUID(),
    audio: {
      storage: getStorage(),
      ttsConfig: env().TTS,
      randomHex: (bytes) => randomBytes(bytes).toString("hex"),
    },
  };
}
