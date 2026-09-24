import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import type { BridgeDeps } from "./handlers";

export function productionDeps(): BridgeDeps {
  return {
    db: getDb(),
    now: () => new Date(),
    revalidate: (path) => revalidatePath(path),
    requestId: () => crypto.randomUUID(),
  };
}
