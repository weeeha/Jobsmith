import { describe, expect, it } from "vitest";
import {
  ARTIFACT_KINDS,
  ARTIFACT_KIND_VALUES,
  DEFAULT_KIND_FOR_TAB,
  ORIGIN_WORDS,
  kindInfo,
  kindsForTab,
  parseKind,
  type ArtifactTab,
} from "@/lib/artifacts/kinds";
import { ARTIFACT_ORIGINS } from "@/lib/artifacts/values";

describe("ARTIFACT_KINDS", () => {
  it("lists the 12 kinds in registry order", () => {
    expect(ARTIFACT_KINDS.map((k) => k.kind)).toEqual([
      "research",
      "fit_brief",
      "people_notes",
      "cv",
      "cover_letter",
      "message_draft",
      "question_bank",
      "call_card",
      "pitch",
      "glossary",
      "debrief",
      "other",
    ]);
    expect(ARTIFACT_KIND_VALUES).toEqual(ARTIFACT_KINDS.map((k) => k.kind));
  });

  it("marks exactly cv, cover_letter and message_draft as sendable", () => {
    expect(ARTIFACT_KINDS.filter((k) => k.sendable).map((k) => k.kind)).toEqual([
      "cv",
      "cover_letter",
      "message_draft",
    ]);
  });

  it("marks exactly research, fit_brief and people_notes as companyWide", () => {
    expect(ARTIFACT_KINDS.filter((k) => k.companyWide).map((k) => k.kind)).toEqual([
      "research",
      "fit_brief",
      "people_notes",
    ]);
  });

  it("gives every kind a non-empty label", () => {
    for (const k of ARTIFACT_KINDS) {
      expect(k.label.length).toBeGreaterThan(0);
    }
  });

  it("assigns every kind to one of the three tabs", () => {
    for (const k of ARTIFACT_KINDS) {
      expect(["research", "documents", "prep"]).toContain(k.tab);
    }
  });
});

describe("kindInfo", () => {
  it("returns the full registry entry for a kind", () => {
    expect(kindInfo("cv")).toEqual({
      kind: "cv",
      tab: "documents",
      label: "CV",
      sendable: true,
      companyWide: false,
    });
  });
});

describe("parseKind", () => {
  it("matches case-insensitively and trims whitespace", () => {
    expect(parseKind("  Cover_Letter  ")).toBe("cover_letter");
    expect(parseKind("RESEARCH")).toBe("research");
  });

  it("maps unknown input to null", () => {
    expect(parseKind("resume")).toBeNull();
    expect(parseKind("")).toBeNull();
  });
});

describe("kindsForTab", () => {
  const tabs: ArtifactTab[] = ["research", "documents", "prep"];

  it.each(tabs)("returns %s's kinds in registry order", (tab) => {
    const expected = ARTIFACT_KINDS.filter((k) => k.tab === tab).map((k) => k.kind);
    expect(kindsForTab(tab)).toEqual(expected);
  });
});

describe("DEFAULT_KIND_FOR_TAB", () => {
  it("names a kind that actually belongs to its own tab", () => {
    for (const tab of ["research", "documents", "prep"] as const) {
      const defaultKind = DEFAULT_KIND_FOR_TAB[tab];
      expect(kindsForTab(tab)).toContain(defaultKind);
    }
  });
});

describe("ORIGIN_WORDS", () => {
  it("has a word for every artifact origin", () => {
    for (const origin of ARTIFACT_ORIGINS) {
      expect(ORIGIN_WORDS[origin]?.length).toBeGreaterThan(0);
    }
  });

  it("uses the exact fixed words", () => {
    expect(ORIGIN_WORDS).toEqual({
      pushed: "Pushed",
      pasted: "Pasted",
      manual: "Written in the app",
      generated: "Generated",
    });
  });
});
