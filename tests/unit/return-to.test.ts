import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/lib/auth/return-to";

describe("safeReturnTo", () => {
  it("keeps a plain same-site path", () => {
    expect(safeReturnTo("/board")).toBe("/board");
    expect(safeReturnTo("/jobs/northwind-staff-designer?tab=prep")).toBe(
      "/jobs/northwind-staff-designer?tab=prep",
    );
  });

  it("falls back to /board when nothing usable is given", () => {
    expect(safeReturnTo(undefined)).toBe("/board");
    expect(safeReturnTo(null)).toBe("/board");
    expect(safeReturnTo("")).toBe("/board");
  });

  it("rejects anything that could leave the site or loop", () => {
    for (const value of [
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "board",
      "/login",
      "/setup?x=1",
    ]) {
      expect(safeReturnTo(value)).toBe("/board");
    }
  });
});
