import { getAiDriver } from "@/lib/ai";
import type { AiDriver } from "@/lib/ai/driver";

// What scoring needs from the outside world, injected so tests can pass a
// fake driver and a fixed clock.
export type FitDeps = { ai: AiDriver | null; now: () => Date };

export function fitDeps(): FitDeps {
  return { ai: getAiDriver(), now: () => new Date() };
}
