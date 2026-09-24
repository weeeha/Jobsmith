import { getDb } from "@/lib/db/client";
import { countUsers } from "./users";

export async function isFirstRun(): Promise<boolean> {
  const count = await countUsers(getDb());
  return count === 0;
}
