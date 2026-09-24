import { describe, expect, it } from "vitest";
import { matchStageRef } from "@/lib/artifacts/stage-ref";

const stages = [
  { id: "s0", kind: "saved" as const, label: "Saved", position: 0 },
  { id: "s1", kind: "recruiter_screen" as const, label: "Recruiter screen", position: 1 },
  { id: "s2", kind: "recruiter_screen" as const, label: "Recruiter screen", position: 2 },
  { id: "s3", kind: "hiring_manager" as const, label: "Hiring manager", position: 3 },
];

describe("matchStageRef", () => {
  it("matches a label case-insensitively with inner whitespace collapsed", () => {
    expect(matchStageRef(stages, "  recruiter   SCREEN  ")).toBe("s1");
  });

  it("takes the first stage by position when two share a label", () => {
    expect(matchStageRef(stages, "Recruiter screen")).toBe("s1");
  });

  it("falls back to a kind match when no label matches, dashes or spaces both work", () => {
    expect(matchStageRef(stages, "hiring-manager")).toBe("s3");
    expect(matchStageRef(stages, "hiring manager")).toBe("s3");
    expect(matchStageRef(stages, "HIRING_MANAGER")).toBe("s3");
  });

  it("prefers a label match over a kind match when both could apply", () => {
    const withKindNamedLabel = [...stages, { id: "s4", kind: "offer" as const, label: "hiring manager", position: 4 }];
    // "hiring manager" matches s3's kind exactly, but s4's LABEL text also
    // reads "hiring manager" and comes later; the label pass runs first and
    // wins over the later stage's coincidental kind match.
    expect(matchStageRef(withKindNamedLabel, "hiring manager")).toBe("s3");
  });

  it("returns null when nothing matches", () => {
    expect(matchStageRef(stages, "offer")).toBeNull();
    expect(matchStageRef(stages, "portfolio case")).toBeNull();
  });

  it("returns null for a blank ref", () => {
    expect(matchStageRef(stages, "   ")).toBeNull();
    expect(matchStageRef(stages, "")).toBeNull();
  });
});
