// Drill's silent gap, pure: how long the user gets to answer aloud before the
// answer is revealed.
import { IDEAL_CPS } from "@/lib/tts/gate";
import { toSpokenText } from "@/lib/tts/spoken";
import type { ParsedBlock } from "./parse";

export const MORE_TIME_SECONDS = 30;

const GAP_MIN_SECONDS = 15;
const GAP_MAX_SECONDS = 120;
// The user needs a little longer than the answer takes to read.
const GAP_PADDING = 1.2;

// The gap factor multiplies after the clamp and the product is not rounded:
// the timer shows whole seconds by rounding up at display.
export function drillGapSeconds(sayChars: number, gapFactor: number): number {
  const base = Math.round((sayChars / IDEAL_CPS) * GAP_PADDING);
  return Math.min(GAP_MAX_SECONDS, Math.max(GAP_MIN_SECONDS, base)) * gapFactor;
}

export function isSayBlock(block: ParsedBlock): boolean {
  return block.label.trim().replace(/:$/, "").trim().toLowerCase() === "say";
}

// The Say block the candidate speaks in Drill: the "Say" one, else the first
// spoken block.
export function sayBlock(blocks: ParsedBlock[]): ParsedBlock | null {
  return blocks.find((b) => b.spoken && isSayBlock(b)) ?? blocks.find((b) => b.spoken) ?? null;
}

export function sayLength(blocks: ParsedBlock[]): number {
  const block = sayBlock(blocks);
  return block ? toSpokenText(block.text).length : 0;
}
