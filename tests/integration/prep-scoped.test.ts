import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser, seedOneOfEach } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { PrepQuestionFields } from "@/lib/db/scoped";

async function setup() {
  const t = await makeTestDb();
  const user = await createTestUser(t.db, `prep-scoped-${Math.random().toString(36).slice(2)}@example.com`);
  const s = scoped(t.db, user.id);
  const ids = await seedOneOfEach(s);
  return { ...t, s, ids };
}

function q(ids: { opportunityId: string; artifactId: string }, key: string, position: number): PrepQuestionFields {
  return {
    opportunityId: ids.opportunityId,
    artifactId: ids.artifactId,
    artifactVersion: 1,
    artifactKey: key,
    number: position + 1,
    position,
    question: `Question ${position}`,
    questionKey: `${position}`.padStart(16, "0"),
  };
}

describe("prep scoped helpers", () => {
  it("replaceForArtifactKey swaps one key's rows and leaves other keys alone", async () => {
    const { s, ids, close } = await setup();
    try {
      // The seed already holds one row under key "cv" at position 0, and the unique pair is per artifact.
      expect(await s.prepQuestion.replaceForArtifactKey(ids.opportunityId, "bank", [q(ids, "bank", 10), q(ids, "bank", 11)])).toBe(2);
      expect(await s.prepQuestion.replaceForArtifactKey(ids.opportunityId, "bank", [q(ids, "bank", 15)])).toBe(1);
      const bank = await s.prepQuestion.listForArtifactKey(ids.opportunityId, "bank");
      expect(bank.map((r) => r.position)).toEqual([15]);
      expect(await s.prepQuestion.listForArtifactKey(ids.opportunityId, "cv")).toHaveLength(1);
      expect(await s.prepQuestion.replaceForArtifactKey(ids.opportunityId, "bank", [])).toBe(0);
      expect(await s.prepQuestion.listForArtifactKey(ids.opportunityId, "bank")).toEqual([]);
      expect((await s.prepQuestion.countsByOpportunity()).get(ids.opportunityId)).toBe(1);
    } finally {
      await close();
    }
  });

  it("applyMark: a newer markedAt replaces the level, an older or equal one keeps it, drill_count and last_drilled_at move on their own", async () => {
    const { s, ids, close } = await setup();
    try {
      const base = { scope: "job" as const, opportunityId: ids.opportunityId, questionKey: "aaaaaaaaaaaaaaaa" };
      const t1 = new Date("2026-11-10T10:00:00Z");
      const t2 = new Date("2026-11-10T11:00:00Z");
      const t0 = new Date("2026-11-10T09:00:00Z");

      const first = await s.prepMark.applyMark({ ...base, level: "shaky", markedAt: t1, drilled: false });
      expect(first.row.level).toBe("shaky");
      expect(first.row.drillCount).toBe(0);
      expect(first.row.lastDrilledAt).toBeNull();

      const newer = await s.prepMark.applyMark({ ...base, level: "solid", markedAt: t2, drilled: true });
      expect(newer.row.level).toBe("solid");
      expect(newer.row.markedAt).toEqual(t2);
      expect(newer.row.drillCount).toBe(1);
      expect(newer.row.lastDrilledAt).toEqual(t2);

      const older = await s.prepMark.applyMark({ ...base, level: "shaky", markedAt: t0, drilled: true });
      expect(older.row.level).toBe("solid");
      expect(older.row.markedAt).toEqual(t2);
      expect(older.row.drillCount).toBe(2);
      expect(older.row.lastDrilledAt).toEqual(t2);

      const equal = await s.prepMark.applyMark({ ...base, level: "okay", markedAt: t2, drilled: false });
      expect(equal.row.level).toBe("solid");
      expect(equal.row.drillCount).toBe(2);
    } finally {
      await close();
    }
  });

  it("applyMark reports applied false when the stored mark is newer", async () => {
    const { s, ids, close } = await setup();
    try {
      const base = { scope: "job" as const, opportunityId: ids.opportunityId, questionKey: "bbbbbbbbbbbbbbbb", drilled: false };
      const fresh = await s.prepMark.applyMark({ ...base, level: "okay", markedAt: new Date("2026-11-10T12:00:00Z") });
      expect(fresh.applied).toBe(true);
      const stale = await s.prepMark.applyMark({ ...base, level: "shaky", markedAt: new Date("2026-11-10T08:00:00Z") });
      expect(stale.applied).toBe(false);
      expect(stale.row.level).toBe("okay");
    } finally {
      await close();
    }
  });

  it("ttsSegment.insert returns null on a duplicate hash", async () => {
    const { s, close } = await setup();
    try {
      const values = {
        hash: "dupdupdupdupdup0",
        provider: "fake",
        model: "fake",
        voice: "v",
        style: "v1",
        textChars: 4,
      };
      expect(await s.ttsSegment.insert(values)).not.toBeNull();
      expect(await s.ttsSegment.insert(values)).toBeNull();
    } finally {
      await close();
    }
  });

  it("statusCounts and asset.totals sum correctly", async () => {
    const { s, close } = await setup();
    try {
      const base = { provider: "fake", model: "fake", voice: "v", style: "v1", textChars: 1 };
      await s.ttsSegment.insert({ ...base, hash: "p000000000000001", status: "pending" });
      await s.ttsSegment.insert({ ...base, hash: "p000000000000002", status: "pending" });
      await s.ttsSegment.insert({ ...base, hash: "f000000000000001", status: "failed" });
      // The seed holds one done segment.
      expect(await s.ttsSegment.statusCounts()).toEqual({ pending: 2, done: 1, failed: 1 });

      await s.asset.insert({
        kind: "recording",
        storageKey: "u/x/rec/second.webm",
        contentType: "audio/webm",
        bytes: 250,
        sha256: "x",
      });
      expect(await s.asset.totals()).toEqual({ bytes: 350, clips: 2 });
    } finally {
      await close();
    }
  });
});
