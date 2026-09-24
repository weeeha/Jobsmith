import { describe, expect, it } from "vitest";
import { pasteTargetSchema, pasteFormSchema, editFormSchema } from "@/lib/artifacts/forms";

describe("pasteTargetSchema", () => {
  it("accepts a new-mode target with no other fields", () => {
    const result = pasteTargetSchema.safeParse({ mode: "new" });
    expect(result).toMatchObject({ success: true, data: { mode: "new" } });
  });

  it("accepts a version-mode target with a scope and a valid key", () => {
    const result = pasteTargetSchema.safeParse({ mode: "version", scope: "company", key: "recon" });
    expect(result).toMatchObject({ success: true, data: { mode: "version", scope: "company", key: "recon" } });
  });

  it("rejects a version-mode target whose key does not match KEY_PATTERN", () => {
    const result = pasteTargetSchema.safeParse({ mode: "version", scope: "opportunity", key: "Not Valid!" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown mode", () => {
    expect(pasteTargetSchema.safeParse({ mode: "bogus" }).success).toBe(false);
  });
});

describe("pasteFormSchema", () => {
  const base = { title: "CV", kind: "cv" as const, stageId: "", bodyMd: "# CV" };

  it("accepts a well-formed submission and turns a blank stageId into null", () => {
    const result = pasteFormSchema.safeParse(base);
    expect(result).toMatchObject({ success: true, data: { stageId: null } });
  });

  it("keeps a real stage id", () => {
    const result = pasteFormSchema.safeParse({ ...base, stageId: "123e4567-e89b-12d3-a456-426614174000" });
    expect(result).toMatchObject({ success: true, data: { stageId: "123e4567-e89b-12d3-a456-426614174000" } });
  });

  it.each([
    [{ ...base, title: "" }, "Give the document a title."],
    [{ ...base, title: "  " }, "Give the document a title."],
    [{ ...base, title: "T".repeat(201) }, "Keep the title to 200 characters or fewer."],
    [{ ...base, kind: "not-a-kind" }, "Choose a kind."],
    [{ ...base, stageId: "not-a-uuid" }, "Choose a stage from the list."],
    [{ ...base, bodyMd: "   " }, "Paste some markdown."],
    [{ ...base, bodyMd: "a".repeat(1_048_577) }, "Keep the markdown under 1 MB."],
  ])("rejects %o with the message %s", (input, message) => {
    const result = pasteFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(message);
    }
  });
});

describe("editFormSchema", () => {
  it("accepts a non-empty body", () => {
    expect(editFormSchema.safeParse({ bodyMd: "# Body" }).success).toBe(true);
  });

  it("rejects a blank body", () => {
    const result = editFormSchema.safeParse({ bodyMd: "   " });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("The document cannot be empty.");
  });

  it("rejects a body over 1 MB", () => {
    const result = editFormSchema.safeParse({ bodyMd: "a".repeat(1_048_577) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Keep the markdown under 1 MB.");
  });
});
