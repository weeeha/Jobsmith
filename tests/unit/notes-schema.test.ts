import { describe, expect, it } from "vitest";
import { addNoteSchema } from "@/lib/pipeline/notes";

describe("addNoteSchema plain messages", () => {
  it("gives a plain message for a blank note", () => {
    const result = addNoteSchema.safeParse({ body: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]!.message).toBe("Enter a note.");
  });
});
