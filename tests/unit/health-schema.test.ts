import { describe, expect, it } from "vitest";
import { aheadMessage, compareSchema, knownMigrationCount } from "@/lib/health/schema";

describe("health schema", () => {
  it("compareSchema: equal is current, fewer is pending, more is ahead", () => {
    expect(compareSchema(38, 38)).toBe("current");
    expect(compareSchema(0, 38)).toBe("pending");
    expect(compareSchema(41, 38)).toBe("ahead");
  });

  it("aheadMessage(41, 38) is the Contract sentence", () => {
    expect(aheadMessage(41, 38)).toBe(
      "Database schema is newer than this version (applied 41, known 38). Restore a backup or run a newer image.",
    );
  });

  it("knownMigrationCount counts journal entries", () => {
    expect(knownMigrationCount()).toBeGreaterThan(0);
  });
});
