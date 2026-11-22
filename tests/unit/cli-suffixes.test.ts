import { describe, expect, it } from "vitest";
import { BUILT_IN_SUFFIXES, mergeSuffixes, lookupSuffix } from "@/cli/src/suffixes";
import { ARTIFACT_KIND_VALUES } from "@/lib/artifacts/kinds";
import { STAGE_KIND_VALUES } from "@/lib/pipeline/values";

describe("BUILT_IN_SUFFIXES", () => {
  it("names only real artifact kinds", () => {
    for (const [suffix, entry] of Object.entries(BUILT_IN_SUFFIXES)) {
      if (entry.kind) {
        expect(ARTIFACT_KIND_VALUES, `suffix "${suffix}"`).toContain(entry.kind);
      }
    }
  });

  it("names only real stage kinds", () => {
    for (const [suffix, entry] of Object.entries(BUILT_IN_SUFFIXES)) {
      if (entry.stage) {
        expect(STAGE_KIND_VALUES, `suffix "${suffix}"`).toContain(entry.stage);
      }
    }
  });

  it("names only opportunity or company as a scope", () => {
    for (const [suffix, entry] of Object.entries(BUILT_IN_SUFFIXES)) {
      if (entry.scope) {
        expect(["opportunity", "company"], `suffix "${suffix}"`).toContain(entry.scope);
      }
    }
  });
});

describe("lookupSuffix", () => {
  it("matches an exact key first", () => {
    expect(lookupSuffix("cv", BUILT_IN_SUFFIXES)).toEqual({ kind: "cv" });
  });

  it("falls back to the longest matching suffix-dash prefix", () => {
    expect(lookupSuffix("debrief-round2", BUILT_IN_SUFFIXES)).toEqual({ kind: "debrief" });
  });

  it("prefers the longer of two prefixes that could both match", () => {
    const map = { call: { kind: "other" }, "call-card": { kind: "call_card" } };
    expect(lookupSuffix("call-card-extra", map)).toEqual({ kind: "call_card" });
  });

  it("maps 'questions-recruiter-screen' to question_bank and 'research' to research with scope company", () => {
    expect(lookupSuffix("questions-recruiter-screen", BUILT_IN_SUFFIXES)).toEqual({ kind: "question_bank" });
    expect(lookupSuffix("questions", BUILT_IN_SUFFIXES)).toEqual({ kind: "question_bank" });
    expect(lookupSuffix("research", BUILT_IN_SUFFIXES)).toEqual({ kind: "research", scope: "company" });
    expect(lookupSuffix("research-notes", BUILT_IN_SUFFIXES)).toEqual({ kind: "research", scope: "company" });
  });

  it("an existing 'research-refresh' entry still wins over 'research' for 'research-refresh' (longest prefix)", () => {
    const map = { ...BUILT_IN_SUFFIXES, "research-refresh": { kind: "other" } };
    expect(lookupSuffix("research-refresh", map)).toEqual({ kind: "other" });
    expect(lookupSuffix("research-refresh-2", map)).toEqual({ kind: "other" });
  });

  it("call-card and people still match as before", () => {
    expect(lookupSuffix("call-card", BUILT_IN_SUFFIXES)).toEqual({ kind: "call_card" });
    expect(lookupSuffix("people", BUILT_IN_SUFFIXES)).toEqual({ kind: "people_notes" });
  });

  it("returns undefined when nothing matches", () => {
    expect(lookupSuffix("mystery-file", BUILT_IN_SUFFIXES)).toBeUndefined();
  });
});

describe("mergeSuffixes", () => {
  it("keeps every base entry untouched when there is no override", () => {
    expect(mergeSuffixes(BUILT_IN_SUFFIXES, {})).toEqual(BUILT_IN_SUFFIXES);
  });

  it("merges an override field by field, keeping the base entry's other fields", () => {
    const merged = mergeSuffixes(BUILT_IN_SUFFIXES, { "call-card": { stage: "Hiring manager" } });
    expect(merged["call-card"]).toEqual({ kind: "call_card", stage: "Hiring manager" });
  });

  it("adds a suffix the base map never had", () => {
    const merged = mergeSuffixes(BUILT_IN_SUFFIXES, { "custom-notes": { kind: "other" } });
    expect(merged["custom-notes"]).toEqual({ kind: "other" });
  });
});
