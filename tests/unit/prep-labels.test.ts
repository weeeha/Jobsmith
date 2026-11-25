import { describe, expect, it } from "vitest";
import { classifyLabel, type LabelClass } from "@/lib/prep/labels";

const spoken = (label: string): LabelClass => ({ kind: "spoken", label });
const note = (label: string, slot: "spine" | "last_line" | "guard" | null): LabelClass => ({
  kind: "note",
  label,
  slot,
});
const unknown = (label: string): LabelClass => ({ kind: "unknown", label });

const boldSpoken = [
  "Say",
  "Long version",
  "Tie to the posting",
  "Follow-up",
  "Follow-up (if pressed on scope)",
  "Follow up 2",
  "If she asks about team size",
  "If he asks why",
  "If they ask about pay",
  "Step 1 (frame)",
  "Then, in every case",
  "If conversational",
  "If basic",
  "If comfortable",
  "Fork A (small team)",
  "Fork B",
  "1. Name the goal",
  "2) Name the cost",
];

describe("classifyLabel", () => {
  it.each(boldSpoken)("bold %s is spoken", (label) => {
    expect(classifyLabel(label, "bold")).toEqual(spoken(label));
  });

  it.each([
    ["Spine", "spine"],
    ["Last line", "last_line"],
    ["Guard", "guard"],
    ["Rests on", null],
    ["If you lose the thread", null],
    ["Why", null],
  ] as const)("bold %s is a note", (label, slot) => {
    expect(classifyLabel(label, "bold")).toEqual(note(label, slot));
  });

  it.each(["Aside", "Notes", "If I were you"])("bold %s is unknown", (label) => {
    expect(classifyLabel(label, "bold")).toEqual(unknown(label));
  });

  it("an italic label that starts with 'If ' is spoken", () => {
    expect(classifyLabel("If the interviewer pushes on scope", "italic")).toEqual(
      spoken("If the interviewer pushes on scope"),
    );
    expect(classifyLabel("If conversational", "italic")).toEqual(spoken("If conversational"));
  });

  it("any other italic label is unknown", () => {
    expect(classifyLabel("Quick note", "italic")).toEqual(unknown("Quick note"));
  });

  it("ignores case, surrounding spaces and a trailing colon", () => {
    expect(classifyLabel("  SAY:  ", "bold")).toEqual(spoken("SAY"));
    expect(classifyLabel("last LINE:", "bold")).toEqual(note("last LINE", "last_line"));
  });

  it("checks note labels before the generic 'If ... asks' rule so 'If you lose the thread' is a note", () => {
    expect(classifyLabel("If you lose the thread", "bold").kind).toBe("note");
    expect(classifyLabel("If you lose the thread", "italic").kind).toBe("note");
  });
});
