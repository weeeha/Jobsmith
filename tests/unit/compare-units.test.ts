import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LONG_LINE_CHARS } from "@/lib/compare/limits";
import { bodyFromUnits, splitUnits, unitsForDiff } from "@/lib/compare/units";

function fixtures(): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  for (const dir of ["tests/fixtures/packet", "tests/fixtures/export"]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
      out.push({ name: `${dir}/${f}`, body: readFileSync(join(dir, f), "utf8") });
    }
  }
  return out;
}

function sentence(first: string, len: number): string {
  return first + "x".repeat(Math.max(0, len - first.length - 1)) + ".";
}

describe("compare units", () => {
  it("join property: splitUnits(body).join('') === body for every fixture and for CRLF-free random text", () => {
    const all = fixtures();
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) expect(splitUnits(f.body).join(""), f.name).toBe(f.body);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const alphabet = ["Hello", "world.", "A", "b?", "9", "\n", "\n\n", " ", "```\n", "# ", "- ", "| x |", '"Q"', "e.g.", "!"];
    for (let i = 0; i < 200; i++) {
      let t = "";
      const n = Math.floor(rnd() * 400);
      for (let j = 0; j < n; j++) t += alphabet[Math.floor(rnd() * alphabet.length)] + (rnd() < 0.5 ? " " : "");
      expect(splitUnits(t).join("")).toBe(t);
    }
  });

  it("a CV bullet line is one unit; a heading is one unit; a table row is one unit; each keeps its trailing newline", () => {
    const body = "# Heading\n- A bullet. Another sentence.\n| a | b |\n";
    expect(splitUnits(body)).toEqual(["# Heading\n", "- A bullet. Another sentence.\n", "| a | b |\n"]);
  });

  it("a paragraph line over 160 characters splits after each sentence end: . ? or ! followed by whitespace and an uppercase letter, digit, quote or bracket", () => {
    const a = sentence("First", 70);
    for (const next of ["Second", "9 items", '"Quoted"', "(Paren)", "[Bracket]"]) {
      const line = `${a} ${next} ${"y".repeat(100)}`;
      expect(line.length).toBeGreaterThan(LONG_LINE_CHARS);
      expect(splitUnits(line + "\n")).toHaveLength(2);
    }
    const q = `${"Why".padEnd(70, "w")}? ${"Yes".padEnd(60, "y")}! ${"Done".padEnd(60, "d")}.\n`;
    const parts = splitUnits(q);
    expect(parts).toHaveLength(3);
    expect(parts[0].endsWith("? ")).toBe(true);
    expect(parts.join("")).toBe(q);
  });

  it("a 159 character line is never split; a 161 character line with one sentence end is split in two", () => {
    const mk = (len: number) => {
      const first = sentence("One", 60) + " ";
      return first + "T" + "z".repeat(len - first.length - 1);
    };
    const l159 = mk(159);
    const l161 = mk(161);
    expect(l159).toHaveLength(159);
    expect(l161).toHaveLength(161);
    expect(splitUnits(l159)).toHaveLength(1);
    expect(splitUnits(l161)).toHaveLength(2);
  });

  it("a lowercase letter after a period does not split ('e.g. this' stays whole)", () => {
    const line = `${"a".repeat(100)} e.g. this stays whole ${"b".repeat(80)}\n`;
    expect(line.length).toBeGreaterThan(LONG_LINE_CHARS);
    expect(splitUnits(line)).toEqual([line]);
  });

  it("lines inside a fenced code block, headings, list items and table rows are never sentence split even when over 160", () => {
    const long = `${sentence("One", 90)} ${sentence("Two", 90)}`;
    for (const fence of ["```", "~~~"]) {
      const body = `${fence}\n${long}\n${fence}\n`;
      expect(splitUnits(body)).toEqual([`${fence}\n`, `${long}\n`, `${fence}\n`]);
    }
    for (const prefix of ["# ", "## ", "- ", "* ", "1. ", "2) ", "| "]) {
      expect(splitUnits(`${prefix}${long}\n`)).toHaveLength(1);
    }
    // after the fence closes, splitting resumes
    expect(splitUnits(`\`\`\`\nx\n\`\`\`\n${long}\n`)).toHaveLength(5);
  });

  it("an empty string returns []; a body with no trailing newline keeps its last unit unterminated", () => {
    expect(splitUnits("")).toEqual([]);
    expect(splitUnits("a\nb")).toEqual(["a\n", "b"]);
  });

  it("bodyFromUnits(unitsForDiff(x)) === x for every fixture, and appending a line to x leaves every earlier unit of unitsForDiff unchanged", () => {
    for (const f of fixtures()) {
      const x = f.body.replace(/\n$/, "");
      expect(bodyFromUnits(unitsForDiff(x)), f.name).toBe(x);
      const before = unitsForDiff(x);
      const after = unitsForDiff(x + "\nAn added line.");
      expect(after.slice(0, before.length), f.name).toEqual(before);
    }
    expect(bodyFromUnits([])).toBe("");
  });

  it("a cover letter paragraph of 3 sentences over 160 characters yields 3 units", () => {
    const p = [sentence("Dear", 60), sentence("I", 60), sentence("Thanks", 60)].join(" ");
    expect(p.length).toBeGreaterThan(LONG_LINE_CHARS);
    expect(splitUnits(p + "\n")).toHaveLength(3);
  });
});
