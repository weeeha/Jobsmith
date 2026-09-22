import { describe, expect, it } from "vitest";
import {
  opportunityIdSchema,
  stageIdSchema,
  moveTargetSchema,
  closedReasonSchema,
} from "@/lib/pipeline/action-schemas";

const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("opportunityIdSchema and stageIdSchema", () => {
  it("accepts a valid uuid", () => {
    expect(opportunityIdSchema.safeParse(UUID).success).toBe(true);
    expect(stageIdSchema.safeParse(UUID).success).toBe(true);
  });

  it("rejects a non-uuid string", () => {
    expect(opportunityIdSchema.safeParse("abc").success).toBe(false);
    expect(stageIdSchema.safeParse("abc").success).toBe(false);
  });
});

describe("moveTargetSchema", () => {
  it("accepts a kind target", () => {
    expect(moveTargetSchema.safeParse({ kind: "applied" }).success).toBe(true);
  });

  it("accepts a stageId target", () => {
    expect(moveTargetSchema.safeParse({ stageId: UUID }).success).toBe(true);
  });

  it("rejects an object with both keys", () => {
    expect(moveTargetSchema.safeParse({ kind: "applied", stageId: UUID }).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(moveTargetSchema.safeParse({ kind: "bogus" }).success).toBe(false);
  });
});

describe("closedReasonSchema", () => {
  it("rejects an unknown reason", () => {
    expect(closedReasonSchema.safeParse("bogus").success).toBe(false);
  });
});
