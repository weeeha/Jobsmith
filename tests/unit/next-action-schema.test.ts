import { describe, expect, it } from "vitest";
import { setNextActionSchema } from "@/lib/pipeline/next-action";

describe("setNextActionSchema plain messages", () => {
  it("gives a plain message for blank text", () => {
    const result = setNextActionSchema.safeParse({ text: "", at: null });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]!.message).toBe("Enter what is next.");
  });

  it("gives a plain message for an invalid date", () => {
    const result = setNextActionSchema.safeParse({ text: "Follow up", at: new Date("not a date") });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]!.message).toBe("Enter a real date and time.");
  });

  it("accepts a null date", () => {
    expect(setNextActionSchema.safeParse({ text: "Follow up", at: null }).success).toBe(true);
  });
});
