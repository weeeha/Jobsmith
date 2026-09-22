import { describe, expect, it } from "vitest";
import { ok, fail } from "@/lib/result";

describe("ok", () => {
  it("wraps data in an ok result", () => {
    expect(ok({ id: "abc" })).toEqual({ ok: true, data: { id: "abc" } });
  });
});

describe("fail", () => {
  it("wraps a code and message in a failure result", () => {
    expect(fail("not_found", "no such row")).toEqual({
      ok: false,
      code: "not_found",
      message: "no such row",
    });
  });
});
