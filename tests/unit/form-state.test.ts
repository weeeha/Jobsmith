import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrorsFromZod } from "@/lib/forms/state";

describe("fieldErrorsFromZod", () => {
  it("keeps one message per top-level field", () => {
    const schema = z.object({
      companyName: z.string().trim().min(1),
      roleTitle: z.string().trim().min(1),
    });
    const result = schema.safeParse({ companyName: "", roleTitle: "" });
    if (result.success) throw new Error("expected validation to fail");
    const errors = fieldErrorsFromZod(result.error);
    expect(Object.keys(errors).sort()).toEqual(["companyName", "roleTitle"]);
    expect(errors.companyName.length).toBeGreaterThan(0);
    expect(errors.roleTitle.length).toBeGreaterThan(0);
  });

  it("keeps only the first issue when one field fails more than one rule", () => {
    const schema = z.object({ value: z.string().min(5).email() });
    const result = schema.safeParse({ value: "a" });
    if (result.success) throw new Error("expected validation to fail");
    const errors = fieldErrorsFromZod(result.error);
    expect(Object.keys(errors)).toEqual(["value"]);
  });
});
