import { describe, expect, it } from "vitest";
import { summaryLine, versionWhen } from "@/lib/compare/header";

const created = new Date("2026-11-01T10:00:00Z");
const edited = new Date("2026-11-02T10:00:00Z");

describe("versionWhen", () => {
  it("edited wins over the origin; manual with no edit reads 'written'", () => {
    expect(versionWhen({ origin: "pushed", createdAt: created, editedAt: edited })).toEqual({ word: "edited", at: edited });
    expect(versionWhen({ origin: "manual", createdAt: created, editedAt: null })).toEqual({ word: "written", at: created });
    expect(versionWhen({ origin: "pushed", createdAt: created, editedAt: null }).word).toBe("pushed");
    expect(versionWhen({ origin: "pasted", createdAt: created, editedAt: null }).word).toBe("pasted");
    expect(versionWhen({ origin: "generated", createdAt: created, editedAt: null }).word).toBe("generated");
  });
});

describe("summaryLine", () => {
  it("reads '48 words added, 21 removed, 3 sections changed'", () => {
    expect(summaryLine({ wordsAdded: 48, wordsRemoved: 21, sectionsChanged: 3 })).toBe("48 words added, 21 removed, 3 sections changed");
  });
  it("uses the singular at 1", () => {
    expect(summaryLine({ wordsAdded: 1, wordsRemoved: 1, sectionsChanged: 1 })).toBe("1 word added, 1 removed, 1 section changed");
  });
});
