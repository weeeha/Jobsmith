import { guardedFetch } from "./fetch-guard";
import { getAiDriver } from "@/lib/ai";
import type { ResolveDeps } from "./resolve";

export type AddJobDeps = ResolveDeps & { now: () => Date; requestId: string };

export function intakeDeps(): AddJobDeps {
  return {
    fetch: guardedFetch,
    ai: getAiDriver(),
    now: () => new Date(),
    requestId: crypto.randomUUID(),
  };
}
