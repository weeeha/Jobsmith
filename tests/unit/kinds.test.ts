import { describe, expect, it } from "vitest";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";

describe("STAGE_KINDS", () => {
  it("lists the seven kinds in board-column order", () => {
    expect(STAGE_KINDS.map((s) => s.kind)).toEqual([
      "saved",
      "applied",
      "recruiter_screen",
      "hiring_manager",
      "portfolio_case",
      "panel_final",
      "offer",
    ]);
  });

  it("has a unique kind for every entry", () => {
    const kinds = STAGE_KINDS.map((s) => s.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("gives every entry a column title and a default label", () => {
    for (const entry of STAGE_KINDS) {
      expect(entry.columnTitle.length).toBeGreaterThan(0);
      expect(entry.defaultLabel.length).toBeGreaterThan(0);
    }
  });
});
