import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { setNextAction } from "@/lib/pipeline/next-action";
import { closeOpportunity } from "@/lib/pipeline/close";
import { snoozeAction } from "@/app/(app)/actions";
import { makeTestDb, createTestUser } from "../helpers/db";
import { seedOpportunity } from "../helpers/opportunity-fixture";
import { seedProfile } from "../helpers/profile";

// Same harness as job-actions.test.ts: the signed-in user and path
// revalidation need a live Next.js request, so both are stubbed, and scopedFor
// points at a real PGlite database through the real scoped().
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

// app/(app)/actions.ts also holds the sign-out action, which imports the auth
// instance; that module reads the server environment when it loads, and no
// test here signs out.
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: async () => {} } } }));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

afterEach(() => {
  vi.useRealTimers();
  revalidatePathMock.mockClear();
});

// Only Date is faked: PGlite and the event loop need the real timers.
function freezeNow(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

describe("snoozeAction", () => {
  it("sets the next action to 09:00 the next calendar day in the profile zone and keeps its text", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "snooze-owner@example.com")).id;
      const s = scoped(db, harness.userId);
      await seedProfile(s, { timezone: "America/New_York" });
      const { id, slug } = await seedOpportunity(s);
      await setNextAction(s, id, { text: "Send portfolio", at: new Date("2026-10-10T13:00:00.000Z") });

      // 16:30 on 11 October in New York (UTC-4).
      freezeNow("2026-10-11T20:30:00.000Z");
      const result = await snoozeAction(id, "next_action_due", "tomorrow");

      expect(result).toEqual({ ok: true, data: null });
      const row = await s.opportunity.getById(id);
      expect(row?.nextAction).toBe("Send portfolio");
      // 09:00 on 12 October in New York is 13:00 UTC.
      expect(row?.nextActionAt).toEqual(new Date("2026-10-12T13:00:00.000Z"));
      expect(revalidatePathMock).toHaveBeenCalledWith("/");
      expect(revalidatePathMock).toHaveBeenCalledWith("/board");
      expect(revalidatePathMock).toHaveBeenCalledWith(`/jobs/${slug}`);
    } finally {
      await close();
    }
  });

  it("gives a job with no next action the fallback text for its rule", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "snooze-fallback@example.com")).id;
      const s = scoped(db, harness.userId);
      await seedProfile(s, { timezone: "UTC" });
      const followUp = await seedOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Design Lead" });
      const saved = await seedOpportunity(s, { companyName: "Lumen Health", roleTitle: "Researcher" });

      freezeNow("2026-10-11T20:30:00.000Z");
      expect(await snoozeAction(followUp.id, "follow_up", "in_3_days")).toEqual({ ok: true, data: null });
      expect(await snoozeAction(saved.id, "apply_or_drop", "next_week")).toEqual({ ok: true, data: null });

      expect(await s.opportunity.getById(followUp.id)).toMatchObject({
        nextAction: "Follow up",
        nextActionAt: new Date("2026-10-14T09:00:00.000Z"),
      });
      expect(await s.opportunity.getById(saved.id)).toMatchObject({
        nextAction: "Apply or drop",
        nextActionAt: new Date("2026-10-18T09:00:00.000Z"),
      });
    } finally {
      await close();
    }
  });

  it("rejects a preset that does not exist and a rule that cannot be snoozed, and changes nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "snooze-invalid@example.com")).id;
      const s = scoped(db, harness.userId);
      const { id } = await seedOpportunity(s);

      const badPreset = await snoozeAction(id, "follow_up", "next_year" as never);
      expect(badPreset).toMatchObject({ ok: false, code: "invalid", message: "Check the highlighted fields." });

      const interview = await snoozeAction(id, "interview_soon" as never, "tomorrow");
      expect(interview).toMatchObject({ ok: false, code: "invalid" });

      expect(await s.opportunity.getById(id)).toMatchObject({ nextAction: null, nextActionAt: null });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("returns not_found for another user's job and invalid for an id that is not a uuid", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      const owner = await createTestUser(db, "snooze-a@example.com");
      const other = await createTestUser(db, "snooze-b@example.com");
      const { id } = await seedOpportunity(scoped(db, owner.id));
      harness.userId = other.id;

      expect(await snoozeAction(id, "follow_up", "tomorrow")).toMatchObject({ ok: false, code: "not_found" });
      expect(await snoozeAction("not-a-uuid", "follow_up", "tomorrow")).toMatchObject({ ok: false, code: "invalid" });
      expect(await scoped(db, owner.id).opportunity.getById(id)).toMatchObject({ nextAction: null });
    } finally {
      await close();
    }
  });

  it("fails with closed on a closed job", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "snooze-closed@example.com")).id;
      const s = scoped(db, harness.userId);
      const { id } = await seedOpportunity(s);
      await closeOpportunity(s, id, "rejected", new Date("2026-10-01T09:00:00.000Z"));

      expect(await snoozeAction(id, "follow_up", "tomorrow")).toMatchObject({
        ok: false,
        code: "closed",
        message: "This job is closed. Reopen it first.",
      });
    } finally {
      await close();
    }
  });
});
