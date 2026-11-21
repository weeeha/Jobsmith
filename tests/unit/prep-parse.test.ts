import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseQuestionBank, type ParsedBlock } from "@/lib/prep/parse";
import { questionKey } from "@/lib/prep/question-key";

const FIXTURES = path.resolve(__dirname, "../fixtures");
const read = (rel: string) => readFileSync(path.join(FIXTURES, rel), "utf8");
const BANK = read("prep/nwt-answers-full.md");

function byNumber(result: ReturnType<typeof parseQuestionBank>, n: number) {
  const q = result.questions.find((x) => x.number === n);
  if (!q) throw new Error(`question ${n} missing`);
  return q;
}

describe("parseQuestionBank", () => {
  it("reads seven questions from the Northwind fixture in file order", () => {
    const { questions } = parseQuestionBank(BANK);
    expect(questions.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(questions.map((q) => q.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("groups questions under the ## heading above them", () => {
    const { questions } = parseQuestionBank(BANK);
    expect(questions.map((q) => q.section)).toEqual([
      "Motivation",
      "Motivation",
      "Craft",
      "Craft",
      "Craft",
      "Craft",
      "Craft",
    ]);
  });

  it("cuts the question at ' (' and strips quotes", () => {
    expect(byNumber(parseQuestionBank(BANK), 2).question).toBe("Why Northwind Traders?");
    expect(byNumber(parseQuestionBank(BANK), 1).question).toBe("Tell me about yourself");
  });

  it("flags an unfilled question and keeps has_answer false when no spoken block has text", () => {
    const q3 = byNumber(parseQuestionBank(BANK), 3);
    expect(q3.question).toBe("Walk me through a project");
    expect(q3.unfilled).toBe(true);
    expect(q3.hasAnswer).toBe(false);
    expect(q3.blocks.some((b) => b.spoken)).toBe(false);
    expect(q3.blocks.some((b) => b.label === "Say")).toBe(false);
    expect(byNumber(parseQuestionBank(BANK), 1).unfilled).toBe(false);
  });

  it("keeps the question text and warns when the marker sits before the closing quote", () => {
    const result = parseQuestionBank(BANK);
    const q5 = byNumber(result, 5);
    expect(q5.question).toBe("A hard decision you made");
    expect(q5.unfilled).toBe(true);
    const w = result.warnings.filter((x) => x.code === "marker_inside_quote");
    expect(w).toHaveLength(1);
    expect(w[0].question).toBe(5);
    expect(BANK.split("\n")[w[0].line - 1]).toContain("A hard decision");
  });

  it("reads Say without a label read aloud and other spoken labels as spoken blocks in source order", () => {
    const q2 = byNumber(parseQuestionBank(BANK), 2);
    const spoken = q2.blocks.filter((b) => b.spoken).map((b) => b.label);
    expect(spoken).toEqual([
      "Say",
      "Long version",
      "Tie to the posting",
      "Follow-up (if pressed on scope)",
      "If she asks about team size",
    ]);
    expect(q2.blocks[0]).toEqual({
      label: "Say",
      spoken: true,
      text: "Northwind Traders sells to shops like the ones I design for.",
    });
  });

  it("reads Spine, Last line, Guard and Rests on as note blocks and fills spine, lastLine and guard", () => {
    const result = parseQuestionBank(BANK);
    const q1 = byNumber(result, 1);
    expect(q1.spine).toBe("Craft, then range, then why Northwind Traders.");
    expect(q1.lastLine).toBe("That is why this role.");
    expect(q1.guard).toBeNull();
    expect(q1.blocks.find((b) => b.label === "Spine")).toEqual({
      label: "Spine",
      spoken: false,
      text: "Craft, then range, then why Northwind Traders.",
    });
    const q2 = byNumber(result, 2);
    expect(q2.guard).toBe("Do not name the previous manager.");
    const rests = q2.blocks.find((b) => b.label === "Rests on");
    expect(rests?.spoken).toBe(false);
    expect(rests?.text).toBe("The pairing story in the portfolio.");
  });

  it("reads Step, Then in every case, an italic conditional and Fork A and B as spoken blocks", () => {
    const q4 = byNumber(parseQuestionBank(BANK), 4);
    const spoken = q4.blocks.filter((b) => b.spoken);
    expect(spoken).toHaveLength(6);
    expect(spoken.map((b) => b.label)).toEqual([
      "Step 1 (frame)",
      "Step 2 (explore)",
      "Then, in every case",
      "If conversational",
      "Fork A (small team)",
      "Fork B (large team)",
    ]);
  });

  it("ignores --- lines and drops a #### heading with everything under it up to the next label or heading", () => {
    const q4 = byNumber(parseQuestionBank(BANK), 4);
    expect(q4.blocks[q4.blocks.length - 1].text).toBe("I write the decision down first.");
    expect(q4.blocks.some((b) => b.text.includes("Salutation"))).toBe(false);
    expect(q4.blocks.some((b) => b.text.includes("---"))).toBe(false);
  });

  it("an #### section ends at the next label, so a following label is read again", () => {
    const body = [
      '### 1. "A"',
      "**Say:** one",
      "#### Form fields",
      "off the tape",
      "**Follow-up:** two",
    ].join("\n");
    const q = parseQuestionBank(body).questions[0];
    expect(q.blocks.map((b) => [b.label, b.text])).toEqual([
      ["Say", "one"],
      ["Follow-up", "two"],
    ]);
  });

  it("turns an unknown bold label into a note block and warns with the label's name", () => {
    const result = parseQuestionBank(BANK);
    const q5 = byNumber(result, 5);
    const aside = q5.blocks.find((b) => b.label === "Aside");
    expect(aside).toEqual({ label: "Aside", spoken: false, text: "This label is not in the grammar." });
    const warning = result.warnings.find((w) => w.code === "unknown_label");
    expect(warning?.message).toContain("Aside");
    expect(warning?.question).toBe(5);
    expect(q5.blocks.find((b) => b.label === "Say")?.spoken).toBe(true);
  });

  it("reads a numbered list label as spoken", () => {
    const q7 = byNumber(parseQuestionBank(BANK), 7);
    const spoken = q7.blocks.filter((b) => b.spoken);
    expect(spoken.map((b) => b.label)).toEqual(["1. Name the goal", "2. Name the cost"]);
    expect(spoken[0].text).toBe("Speed of the first order.");
  });

  it("leaves an unresolved include as a note and counts it", () => {
    const result = parseQuestionBank(BANK);
    const q6 = byNumber(result, 6);
    expect(q6.unresolvedIncludes).toBe(1);
    expect(q6.blocks).toEqual([
      { label: "", spoken: false, text: "Includes question 2 of nwt-curveballs.md, not found here" },
    ]);
    expect(q6.hasAnswer).toBe(false);
    expect(result.warnings.some((w) => w.code === "unresolved_include" && w.question === 6)).toBe(true);
  });

  it("splices a resolved include's spoken blocks in place", () => {
    const calls: [string, number][] = [];
    const blocks: ParsedBlock[] = [
      { label: "Say", spoken: true, text: "I listen first." },
      { label: "Follow-up", spoken: true, text: "Then I propose a fix." },
    ];
    const result = parseQuestionBank(BANK, {
      resolveInclude: (file, n) => {
        calls.push([file, n]);
        return blocks;
      },
    });
    expect(calls).toEqual([["nwt-curveballs.md", 2]]);
    const q6 = byNumber(result, 6);
    expect(q6.blocks).toEqual(blocks);
    expect(q6.unresolvedIncludes).toBe(0);
    expect(q6.hasAnswer).toBe(true);
    expect(result.warnings.some((w) => w.code === "unresolved_include")).toBe(false);
  });

  it("never speaks section notes or text above the first question", () => {
    const { questions } = parseQuestionBank(BANK);
    const all = questions.flatMap((q) => q.blocks.map((b) => b.text)).join("\n");
    expect(all).not.toContain("Notes above the first section");
    expect(all).not.toContain("Priya Raman");
  });

  it("sets question_key from the cleaned question text", () => {
    const { questions } = parseQuestionBank(BANK);
    for (const q of questions) expect(q.questionKey).toBe(questionKey(q.question));
    expect(byNumber({ questions, warnings: [] }, 2).questionKey).toBe(questionKey("Why Northwind Traders?"));
  });

  it("collects lines after a label into that block, joined with newlines and trimmed", () => {
    const body = ['### 1. "A"', "**Say:** first line", "second line", "", "third line", "", "**Spine:** s"].join("\n");
    const q = parseQuestionBank(body).questions[0];
    expect(q.blocks[0].text).toBe("first line\nsecond line\n\nthird line");
  });

  it("puts lines before the first label into one note block with an empty label", () => {
    const body = ['### 1. "A"', "Some context first.", "**Say:** spoken"].join("\n");
    const q = parseQuestionBank(body).questions[0];
    expect(q.blocks[0]).toEqual({ label: "", spoken: false, text: "Some context first." });
    expect(q.blocks[1].spoken).toBe(true);
  });

  it("parses CRLF input like LF input", () => {
    const lf = parseQuestionBank(BANK);
    const crlf = parseQuestionBank(BANK.replace(/\n/g, "\r\n"));
    expect(crlf).toEqual(lf);
  });

  it("returns no questions and no warnings for a document with no heading of the form '### N.'", () => {
    expect(parseQuestionBank("# Title\n\n## Section\n\nJust text.\n\n### Not numbered\n")).toEqual({
      questions: [],
      warnings: [],
    });
    expect(parseQuestionBank("")).toEqual({ questions: [], warnings: [] });
  });

  it("parses the packet fixture nwl-answers-full.md to zero questions", () => {
    const result = parseQuestionBank(read("packet/nwl-answers-full.md"));
    expect(result.questions).toEqual([]);
  });

  it("parses the packet fixture nwl-call-card.md to zero questions and no warnings", () => {
    expect(parseQuestionBank(read("packet/nwl-call-card.md"))).toEqual({ questions: [], warnings: [] });
  });

  it("parses the packet fixture nwl-hr-bank.md to zero questions", () => {
    expect(parseQuestionBank(read("packet/nwl-hr-bank.md")).questions).toEqual([]);
  });

  it("the v2 fixture differs from v1 only in the Say text of question 1", () => {
    const v2 = parseQuestionBank(read("prep/v2/nwt-answers-full.md"));
    expect(byNumber(v2, 1).blocks[0].text).toBe(
      "I design ordering tools for small shops, and I like the moment a messy process turns clear.",
    );
    expect(v2.questions.map((q) => q.questionKey)).toEqual(
      parseQuestionBank(BANK).questions.map((q) => q.questionKey),
    );
  });
});
