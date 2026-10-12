import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrorsByPath, fieldErrorsFromZod } from "@/lib/forms/state";

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
    const schema = z.object({
      value: z.string().min(5, "too short").email("not a valid email"),
    });
    const result = schema.safeParse({ value: "a" });
    if (result.success) throw new Error("expected validation to fail");
    const errors = fieldErrorsFromZod(result.error);
    expect(Object.keys(errors)).toEqual(["value"]);
    expect(errors.value).toBe("too short");
  });
});

describe("fieldErrorsByPath", () => {
  const schema = z.object({
    titles: z.array(z.string().min(1, "Remove the empty entry.")),
    companySize: z.object({ max: z.number({ error: "Enter a number." }) }),
    attention: z.object({ followUpDays: z.number({ error: "Enter a number." }) }),
    name: z.string().min(1, "Enter a name."),
  });

  it("joins nested paths with dots", () => {
    const result = schema.safeParse({ titles: [], companySize: { max: "x" }, attention: { followUpDays: "y" }, name: "ok" });
    if (result.success) throw new Error("expected validation to fail");
    expect(fieldErrorsByPath(result.error)).toEqual({
      "companySize.max": "Enter a number.",
      "attention.followUpDays": "Enter a number.",
    });
  });

  it("drops array indices, so every entry of a list reports under the list name", () => {
    const result = schema.safeParse({ titles: ["ok", "", ""], companySize: { max: 1 }, attention: { followUpDays: 1 }, name: "ok" });
    if (result.success) throw new Error("expected validation to fail");
    expect(fieldErrorsByPath(result.error)).toEqual({ titles: "Remove the empty entry." });
  });

  it("keeps the first message per key", () => {
    const result = z.object({ a: z.string().min(3, "first").regex(/^z/, "second") }).safeParse({ a: "x" });
    if (result.success) throw new Error("expected validation to fail");
    expect(fieldErrorsByPath(result.error)).toEqual({ a: "first" });
  });

  it("skips an issue that has no path", () => {
    const result = z.object({ a: z.string() }).refine(() => false, "whole object").safeParse({ a: "x" });
    if (result.success) throw new Error("expected validation to fail");
    expect(fieldErrorsByPath(result.error)).toEqual({});
  });
});
