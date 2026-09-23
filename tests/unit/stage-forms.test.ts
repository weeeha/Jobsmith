import { describe, expect, it } from "vitest";
import { renameStageFormSchema, addStageFormSchema, stageDetailFormSchema } from "@/lib/pipeline/stage-forms";
import { messageFor } from "@/lib/pipeline/messages";

describe("renameStageFormSchema", () => {
  it("uses the fixed label_required message for a blank label", () => {
    const result = renameStageFormSchema.safeParse({ label: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]!.message).toBe(messageFor("label_required"));
  });
});

describe("addStageFormSchema", () => {
  it("gives a plain message for an unknown kind", () => {
    const result = addStageFormSchema.safeParse({ kind: "bogus", label: "Take-home" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]!.message).toBe("Choose a stage kind.");
  });

  it("uses the fixed label_required message for a blank label", () => {
    const result = addStageFormSchema.safeParse({ kind: "portfolio_case", label: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]!.message).toBe(messageFor("label_required"));
  });
});

describe("stageDetailFormSchema", () => {
  it("gives a plain message for an unknown format", () => {
    const result = stageDetailFormSchema.safeParse({ scheduledAt: "", format: "bogus", outcomeMd: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]!.message).toBe("Choose a format.");
  });

  it("accepts the empty format (no format set)", () => {
    expect(stageDetailFormSchema.safeParse({ scheduledAt: "", format: "", outcomeMd: "" }).success).toBe(true);
  });
});
