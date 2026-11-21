import { describe, expect, it } from "vitest";
import { labelSpokenText, toSpokenText } from "@/lib/tts/spoken";

describe("toSpokenText", () => {
  it("removes bold and italic markers and keeps the words", () => {
    expect(toSpokenText("**Say** *this*")).toBe("Say this");
    expect(toSpokenText("__Say__ _this_ and ***both***")).toBe("Say this and both");
  });

  it("keeps a link's text and drops its address", () => {
    expect(toSpokenText("See [the docs](https://example.com/a?b=1) now")).toBe("See the docs now");
  });

  it("removes the warning marker and emoji", () => {
    expect(toSpokenText("⚠️ Careful here 🎯")).toBe("Careful here");
  });

  it("joins bullet and numbered list items as sentences", () => {
    expect(toSpokenText("- one\n- two")).toBe("one. two.");
    expect(toSpokenText("1. a\n2. b")).toBe("a. b.");
    expect(toSpokenText("* x\n+ y")).toBe("x. y.");
  });

  it("does not double a full stop on an item that already ends in one", () => {
    expect(toSpokenText("- one.\n- two?\n- three")).toBe("one. two? three.");
  });

  it("removes heading markers and inline code backticks", () => {
    expect(toSpokenText("## Heading\nUse `code` here")).toBe("Heading Use code here");
  });

  it("drops a leftover {{include ...}} token", () => {
    expect(toSpokenText("Before {{include intro}} after")).toBe("Before after");
  });

  it("collapses whitespace and trims", () => {
    expect(toSpokenText("  a \n\n  b\t c  ")).toBe("a b c");
  });

  it("returns an empty string for markup-only input", () => {
    expect(toSpokenText("**  **")).toBe("");
    expect(toSpokenText("⚠️")).toBe("");
    expect(toSpokenText("{{include x}}")).toBe("");
  });
});

describe("labelSpokenText", () => {
  it("returns the label with its colon", () => {
    expect(labelSpokenText("Follow-up (if pressed)")).toBe("Follow-up (if pressed):");
  });

  it("does not double an existing colon", () => {
    expect(labelSpokenText("Say:")).toBe("Say:");
  });
});
