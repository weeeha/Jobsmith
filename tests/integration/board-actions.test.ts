import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { createOpportunityAction } from "@/app/(app)/board/actions";
import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";
import { makeTestDb, createTestUser } from "../helpers/db";

// createOpportunityAction turns the Add job form's text into numbers before
// createOpportunitySchema sees it, so createOpportunity's own tests cannot
// catch a bad conversion here: by then every pay figure is already a number
// or undefined. These tests call the action itself. The signed-in user and
// path revalidation need a live Next.js request, so both are stubbed;
// scopedFor is pointed at a real PGlite database through the real scoped().
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

async function signInAs(db: Db, email: string): Promise<void> {
  harness.db = db;
  harness.userId = (await createTestUser(db, email)).id;
}

function addJobForm(pay: Record<string, string>): FormData {
  const formData = new FormData();
  formData.set("companyName", "Acme Robotics");
  formData.set("roleTitle", "Product Designer");
  for (const [name, value] of Object.entries(pay)) formData.set(name, value);
  return formData;
}

describe("createOpportunityAction pay figures", () => {
  it.each(["compMin", "compMax"])(
    "rejects a %s that is not a number instead of adding the job without it",
    async (field) => {
      const { db, close } = await makeTestDb();
      try {
        await signInAs(db, "adder@example.com");
        const state = await createOpportunityAction(undefined, addJobForm({ [field]: "12k" }));
        expect(state).toMatchObject({ ok: false, code: "invalid", fieldErrors: { [field]: "Enter a number." } });
        expect(await db.select().from(schema.opportunity)).toHaveLength(0);
      } finally {
        await close();
      }
    },
  );

  // lib/forms/submit.ts sends this in place of a Pay box the browser holds
  // text for but cannot read ("12e"). Read as blank, it would add the job
  // without the figure.
  it("rejects the stand-in sent for a pay figure the browser could not read", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "adder@example.com");
      const state = await createOpportunityAction(undefined, addJobForm({ compMin: UNREADABLE_INPUT_VALUE }));
      expect(state).toMatchObject({ ok: false, code: "invalid", fieldErrors: { compMin: "Enter a number." } });
      expect(await db.select().from(schema.opportunity)).toHaveLength(0);
    } finally {
      await close();
    }
  });

  // Number("") and Number("  ") are both 0, so a blank Pay box has to be
  // caught before Number() runs or it would be saved as a pay figure of 0.
  it("treats a blank pay figure as not given", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "adder@example.com");
      expect(await createOpportunityAction(undefined, addJobForm({ compMin: "", compMax: "  " }))).toEqual({
        ok: true,
      });
      const [row] = await db.select().from(schema.opportunity);
      expect(row).toMatchObject({ compMin: null, compMax: null });
    } finally {
      await close();
    }
  });

  it("stores a pay figure that is a number", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "adder@example.com");
      expect(await createOpportunityAction(undefined, addJobForm({ compMin: "120000" }))).toEqual({ ok: true });
      const [row] = await db.select().from(schema.opportunity);
      expect(row).toMatchObject({ compMin: 120000 });
    } finally {
      await close();
    }
  });
});
