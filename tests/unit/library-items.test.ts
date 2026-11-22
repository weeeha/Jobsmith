import { describe, expect, it } from "vitest";
import {
  LIBRARY_BODY_MAX,
  LIBRARY_TITLE_MAX,
  firstLine,
  libraryItemInputSchema,
} from "@/lib/library/items";

const base = { kind: "story", title: "The Northwind rebuild", bodyMd: "We rebuilt the picker.", tags: [] as string[] };

function messages(input: unknown): string[] {
  const parsed = libraryItemInputSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
}

describe("libraryItemInputSchema", () => {
  it("the schema trims the title and rejects an empty one with 'Give the item a title.'", () => {
    const parsed = libraryItemInputSchema.parse({ ...base, title: "  Padded title  " });
    expect(parsed.title).toBe("Padded title");
    expect(messages({ ...base, title: "   " })).toContain("Give the item a title.");
    expect(messages({ ...base, title: "x".repeat(LIBRARY_TITLE_MAX + 1) })).toContain(
      `Keep the title to ${LIBRARY_TITLE_MAX} characters or fewer.`,
    );
  });

  it("tags follow the list rules: trimmed, deduplicated without regard to case, at most 20, each at most 80 characters, with explicit messages", () => {
    const parsed = libraryItemInputSchema.parse({ ...base, tags: [" Pricing ", "pricing", "", "Research"] });
    expect(parsed.tags).toEqual(["Pricing", "Research"]);

    const twentyOne = Array.from({ length: 21 }, (_, i) => `tag ${i}`);
    expect(messages({ ...base, tags: twentyOne })).toContain("Use at most 20 tags.");
    expect(messages({ ...base, tags: ["x".repeat(81)] })).toContain("Keep each tag to 80 characters or fewer.");
    // 20 after deduplication is fine even when more were typed.
    const dupes = [...Array.from({ length: 20 }, (_, i) => `tag ${i}`), "TAG 0"];
    expect(libraryItemInputSchema.safeParse({ ...base, tags: dupes }).success).toBe(true);
  });

  it("a body over the limit is rejected with an explicit message", () => {
    expect(messages({ ...base, bodyMd: "x".repeat(LIBRARY_BODY_MAX + 1) })).toContain(
      "Keep the body to 50,000 characters or fewer.",
    );
    expect(libraryItemInputSchema.safeParse({ ...base, bodyMd: "x".repeat(LIBRARY_BODY_MAX) }).success).toBe(true);
  });

  it("kind must be one of answer, story, intro, fact", () => {
    for (const kind of ["answer", "story", "intro", "fact"]) {
      expect(libraryItemInputSchema.safeParse({ ...base, kind }).success).toBe(true);
    }
    expect(messages({ ...base, kind: "pitch" })).toContain("Choose answer, story, intro or fact.");
  });
});

describe("firstLine", () => {
  it("firstLine strips markers and cuts at 140 characters", () => {
    expect(firstLine("\n\n## Heading line\nsecond")).toBe("Heading line");
    expect(firstLine("- **Bold** item with `code`")).toBe("Bold item with code");
    expect(firstLine("> quoted text")).toBe("quoted text");
    expect(firstLine("1. numbered")).toBe("numbered");
    expect(firstLine("   \n  ")).toBe("");
    const long = firstLine("a".repeat(300));
    expect(long.length).toBe(140);
  });
});
