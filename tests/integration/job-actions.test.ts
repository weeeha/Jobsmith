import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { scoped } from "@/lib/db/scoped";
import type { AiDriver } from "@/lib/ai/driver";
import { createFakeDriver } from "@/lib/ai/fake";
import { createOpportunity } from "@/lib/pipeline/create";
import { updateOpportunityDetailsAction, markReviewedAction, scoreFitAction } from "@/app/(app)/jobs/[slug]/actions";
import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";
import { makeTestDb, createTestUser } from "../helpers/db";
import { seedProfile } from "../helpers/profile";

// updateOpportunityDetailsAction turns the Edit details form's text into
// values before updateOpportunityDetailsSchema sees it, and a blank Pay box
// means "clear this figure" there, so these tests call the action itself.
// Same harness as board-actions.test.ts: the signed-in user and path
// revalidation need a live Next.js request, so both are stubbed; scopedFor
// is pointed at a real PGlite database through the real scoped().
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "", ai: null as AiDriver | null }));

const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/fit/deps", () => ({
  fitDeps: () => ({ ai: harness.ai, now: () => new Date("2026-10-15T09:00:00.000Z") }),
}));

afterEach(() => {
  harness.ai = null;
  vi.restoreAllMocks();
});

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

async function jobNeedingReview(db: Db): Promise<{ id: string; slug: string }> {
  harness.db = db;
  harness.userId = (await createTestUser(db, "reviewer@example.com")).id;
  const created = await createOpportunity(scoped(db, harness.userId), {
    companyName: "Northwind Traders",
    roleTitle: "Product Designer",
    needsReview: true,
  });
  if (!created.ok) throw new Error(created.message);
  return { id: created.data.id, slug: created.data.slug };
}

async function storedNeedsReview(db: Db, opportunityId: string): Promise<boolean | undefined> {
  const [row] = await db
    .select({ needsReview: schema.opportunity.needsReview })
    .from(schema.opportunity)
    .where(eq(schema.opportunity.id, opportunityId));
  return row?.needsReview;
}

describe("markReviewedAction", () => {
  it("clears needs_review and revalidates the board and the job page", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { id, slug } = await jobNeedingReview(db);
      expect(await storedNeedsReview(db, id)).toBe(true);
      revalidatePathMock.mockClear();

      const result = await markReviewedAction(id);

      expect(result).toEqual({ ok: true, data: null });
      expect(await storedNeedsReview(db, id)).toBe(false);
      expect(revalidatePathMock).toHaveBeenCalledWith("/board");
      expect(revalidatePathMock).toHaveBeenCalledWith(`/jobs/${slug}`);
    } finally {
      await close();
    }
  });

  // Only the code is pinned here, not markOpportunityReviewed's own
  // message text (lib/pipeline/messages.ts owns it) - asserting an
  // exact string owned by another file would make this test fail
  // for a reason that has nothing to do with markReviewedAction itself.
  it("returns not_found for an id that does not exist, and revalidates nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "reviewer2@example.com")).id;
      revalidatePathMock.mockClear();

      const result = await markReviewedAction("00000000-0000-4000-8000-000000000099");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
      expect(revalidatePathMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });
});

describe("scoreFitAction", () => {
  async function jobWithPosting(db: Db, posting: string | null, email = "scorer@example.com") {
    harness.db = db;
    harness.userId = (await createTestUser(db, email)).id;
    const s = scoped(db, harness.userId);
    const created = await createOpportunity(s, {
      companyName: "Northwind Traders",
      roleTitle: "Product Designer",
      ...(posting === null ? {} : { postingText: posting }),
    });
    if (!created.ok) throw new Error(created.message);
    return { s, id: created.data.id, slug: created.data.slug };
  }

  async function storedFit(db: Db, id: string) {
    const [row] = await db
      .select({ fitStatus: schema.opportunity.fitStatus, fitScore: schema.opportunity.fitScore })
      .from(schema.opportunity)
      .where(eq(schema.opportunity.id, id));
    return row;
  }

  it("scores the job, reports the run and revalidates the board and the job page", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, id, slug } = await jobWithPosting(db, "Fit score: 81\nAbout the job");
      await seedProfile(s);
      harness.ai = createFakeDriver();
      vi.spyOn(console, "info").mockImplementation(() => {});
      revalidatePathMock.mockClear();

      const result = await scoreFitAction(id);

      expect(result).toEqual({ ok: true, data: { status: "done", score: 81 } });
      expect(await storedFit(db, id)).toEqual({ fitStatus: "done", fitScore: 81 });
      expect(revalidatePathMock).toHaveBeenCalledWith("/board");
      expect(revalidatePathMock).toHaveBeenCalledWith(`/jobs/${slug}`);
    } finally {
      await close();
    }
  });

  it("reports a failed run as data and leaves the job failed, so the card can show the failure line", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, id } = await jobWithPosting(db, "Fit score: fail\nAbout the job");
      await seedProfile(s);
      harness.ai = createFakeDriver();
      vi.spyOn(console, "info").mockImplementation(() => {});

      expect(await scoreFitAction(id)).toEqual({ ok: true, data: { status: "failed", score: null } });
      expect(await storedFit(db, id)).toEqual({ fitStatus: "failed", fitScore: null });
    } finally {
      await close();
    }
  });

  it("scores again after a failure", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, id } = await jobWithPosting(db, "About the job");
      await seedProfile(s);
      await s.opportunity.update(id, { fitStatus: "failed" });
      harness.ai = createFakeDriver();
      vi.spyOn(console, "info").mockImplementation(() => {});

      expect(await scoreFitAction(id)).toEqual({ ok: true, data: { status: "done", score: 64 } });
      expect(await storedFit(db, id)).toEqual({ fitStatus: "done", fitScore: 64 });
    } finally {
      await close();
    }
  });

  it.each([
    ["AI is off", "About the job", true, false],
    ["the job has no posting", null, false, true],
    ["there is no resume", "About the job", false, true],
  ] as const)("returns not_ready, and changes nothing, when %s", async (_name, posting, resume, aiOn) => {
    const { db, close } = await makeTestDb();
    try {
      const { s, id } = await jobWithPosting(db, posting);
      await seedProfile(s, resume ? undefined : { resumeMd: null });
      if (aiOn) harness.ai = createFakeDriver();
      revalidatePathMock.mockClear();

      const result = await scoreFitAction(id);

      expect(result).toEqual({ ok: false, code: "not_ready", message: "This job cannot be scored yet." });
      expect(await storedFit(db, id)).toEqual({ fitStatus: "none", fitScore: null });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("returns not_found for another user's job and for an id that is not an id", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, id } = await jobWithPosting(db, "About the job", "owner@example.com");
      await seedProfile(s);
      const driver = createFakeDriver();
      harness.ai = driver;
      harness.userId = (await createTestUser(db, "intruder@example.com")).id;
      await seedProfile(scoped(db, harness.userId));
      revalidatePathMock.mockClear();

      expect(await scoreFitAction(id)).toMatchObject({ ok: false, code: "not_found" });
      expect(await scoreFitAction("not-an-id")).toMatchObject({ ok: false, code: "not_found" });
      expect(await storedFit(db, id)).toEqual({ fitStatus: "none", fitScore: null });
      expect(driver.calls).toHaveLength(0);
    } finally {
      await close();
    }
  });
});
