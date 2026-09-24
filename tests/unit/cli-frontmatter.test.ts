import { describe, expect, it } from "vitest";
import { splitFrontmatter } from "@/cli/src/frontmatter";

describe("splitFrontmatter", () => {
  it("returns no data and the whole text when there is no frontmatter block", () => {
    expect(splitFrontmatter("# Title\n\nBody.\n")).toEqual({ data: {}, body: "# Title\n\nBody.\n" });
  });

  it("parses a flat key: value block and strips it from the body", () => {
    const text = '---\nkind: research\nscope: company\ntitle: "Company recon"\n---\n# Recon\n\nText.\n';
    expect(splitFrontmatter(text)).toEqual({
      data: { kind: "research", scope: "company", title: "Company recon" },
      body: "# Recon\n\nText.\n",
    });
  });

  it("tolerates a leading BOM and CRLF line endings", () => {
    const text = "﻿---\r\nkind: debrief\r\n---\r\n# Debrief\r\n";
    expect(splitFrontmatter(text)).toEqual({ data: { kind: "debrief" }, body: "# Debrief\n" });
  });

  it("treats a block that starts with --- but never closes as having no frontmatter at all", () => {
    const text = "---\nkind: debrief\n# Debrief\n";
    expect(splitFrontmatter(text)).toEqual({ data: {}, body: text });
  });

  it("strips matching quotes from a quoted value but leaves an unquoted value untouched", () => {
    const text = '---\ntitle: "Quoted title"\nstage: Unquoted stage\n---\nBody\n';
    expect(splitFrontmatter(text).data).toEqual({ title: "Quoted title", stage: "Unquoted stage" });
  });

  it("ignores a line inside the block that is not itself a key: value pair", () => {
    const text = "---\nkind: debrief\nnot a valid line\nstage: Final loop\n---\nBody\n";
    expect(splitFrontmatter(text).data).toEqual({ kind: "debrief", stage: "Final loop" });
  });
});
