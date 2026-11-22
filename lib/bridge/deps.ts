import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import type { BridgeDeps } from "./auth";

export function productionDeps(): BridgeDeps {
  return {
    db: getDb(),
    now: () => new Date(),
    revalidate: (path) => revalidatePath(path),
    requestId: () => crypto.randomUUID(),
    appUrl: env().APP_URL,
  };
}
