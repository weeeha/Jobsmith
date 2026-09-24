import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { updateOpportunityDetailsAction } from "@/app/(app)/jobs/[slug]/actions";
import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";
import { makeTestDb, createTestUser } from "../helpers/db";

// updateOpportunityDetailsAction turns the Edit details form's text into
// values before updateOpportunityDetailsSchema sees it, and a blank Pay box
// means "clear this figure" there, so these tests call the action itself.
// Same harness as board-actions.test.ts: the signed-in user and path
// revalidation need a live Next.js request, so both are stubbed; scopedFor
// is pointed at a real PGlite database through the real scoped().
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

async function jobPaying120To150(db: Db): Promise<string> {
  harness.db = db;
  harness.userId = (await createTestUser(db, "editor@example.com")).id;
  const created = await createOpportunity(scoped(db, harness.userId), {
    companyName: "Acme Robotics",
    roleTitle: "Product Designer",
    compMin: 120000,
    compMax: 150000,
  });
  if (!created.ok) throw new Error(created.message);
  return created.data.id;
}

function detailsForm(pay: Record<string, string>): FormData {
  const formData = new FormData();
  formData.set("roleTitle", "Product Designer");
  for (const [name, value] of Object.entries(pay)) formData.set(name, value);
  return formData;
}

async function storedPay(db: Db, opportunityId: string) {
  const [row] = await db
    .select({ compMin: schema.opportunity.compMin, compMax: schema.opportunity.compMax })
    .from(schema.opportunity)
    .where(eq(schema.opportunity.id, opportunityId));
  return row;
}

describe("updateOpportunityDetailsAction pay figures", () => {
  // lib/forms/submit.ts sends this in place of a Pay box the browser holds
  // text for but cannot read ("125e"). Read as blank, it would clear the
  // stored figure.
  it("rejects the stand-in sent for a pay figure the browser could not read and keeps the stored one", async () => {
    const { db, close } = await makeTestDb();
    try {
      const id = await jobPaying120To150(db);
      const state = await updateOpportunityDetailsAction(
        id,
        undefined,
        detailsForm({ compMin: UNREADABLE_INPUT_VALUE, compMax: "150000" }),
      );
      expect(state).toMatchObject({ ok: false, code: "invalid", fieldErrors: { compMin: "Enter a number." } });
      expect(await storedPay(db, id)).toEqual({ compMin: 120000, compMax: 150000 });
    } finally {
      await close();
    }
  });

  it("clears a pay figure left blank", async () => {
    const { db, close } = await makeTestDb();
    try {
      const id = await jobPaying120To150(db);
      const state = await updateOpportunityDetailsAction(id, undefined, detailsForm({ compMin: "", compMax: "150000" }));
      expect(state).toEqual({ ok: true });
      expect(await storedPay(db, id)).toEqual({ compMin: null, compMax: 150000 });
    } finally {
      await close();
    }
  });
});
