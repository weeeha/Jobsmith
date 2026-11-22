import { getDb } from "@/lib/db/client";
import pkg from "../../package.json";
import { runHealth, type HealthBody } from "./check";
import { knownMigrationCount } from "./schema";

export type { HealthBody } from "./check";

export function resolveVersion(): string {
  return process.env.JOBSMITH_VERSION || pkg.version;
}

export async function healthResponse(): Promise<{ status: 200 | 503; body: HealthBody }> {
  const body = await runHealth(getDb(), knownMigrationCount(), resolveVersion());
  return { status: body.status === "ok" ? 200 : 503, body };
}
