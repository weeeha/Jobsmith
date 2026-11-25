import { describe, expect, it } from "vitest";
import { PREP_COPY } from "@/lib/prep/copy";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("PREP_COPY", () => {
  it("holds the spec's fixed strings character for character", () => {
    expect(PREP_COPY.empty).toBe("No prep yet. Push a question bank or paste one.");
    expect(PREP_COPY.noQuestions).toBe(
      'This document has no questions Jobsmith can read. A question is a line like `### 1. "Tell me about yourself"`.',
    );
    expect(PREP_COPY.audio.browser).toBe("Browser voice");
    expect(PREP_COPY.buttons).toEqual({
      quickFire: "Quick-fire",
      rebuild: "Rebuild questions",
      checkBank: "Check the bank",
      unfilledChip: "unfilled",
    });
    expect(PREP_COPY.marks).toEqual({ shaky: "Shaky", okay: "Okay", solid: "Solid" });
    expect(PREP_COPY.quickFireEmpty).toBe("Nothing to practice yet. Quick-fire needs questions that have a Spine.");
    expect(PREP_COPY.toTheBrowserVoiceLine).toBe("Audio uses your browser's voices. Settings has the voice options.");
  });

  it("contains no exclamation mark and no em dash", () => {
    for (const text of strings(PREP_COPY)) {
      expect(text).not.toContain("!");
      expect(text).not.toContain("—");
    }
  });
});
