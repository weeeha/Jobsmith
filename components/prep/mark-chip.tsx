import { ToneChip, type ChipTone } from "@/components/fit/fit-chips";
import { PREP_COPY } from "@/lib/prep/copy";
import type { MarkLevel } from "@/lib/prep/values";

// A mark is its word first; the tone only backs the word up.
const LEVEL_TONE: Record<MarkLevel, ChipTone> = { shaky: "action", okay: "pending", solid: "approved" };

export function MarkChip({ level, className }: { level: MarkLevel | null; className?: string }) {
  if (level === null) return null;
  return (
    <ToneChip tone={LEVEL_TONE[level]} data-level={level} className={className}>
      {PREP_COPY.marks[level]}
    </ToneChip>
  );
}
