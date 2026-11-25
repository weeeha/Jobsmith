import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { markQuestion, markInputSchema, type MarkInput } from "@/lib/prep/marks";
import { questionKey } from "@/lib/prep/question-key";
import { expectFail, expectOk } from "../helpers/result";

const KEY = questionKey("Tell me about yourself");
const NOW = new Date("2026-02-01T12:00:00Z");

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const created = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Designer" }));
  return { db, s, close, opportunityId: created.id };
}

async function addQuestion(s: Scoped, opportunityId: string, text = "Tell me about yourself", key = "bank") {
  const artifact = await s.artifact.insert({
    opportunityId,
    companyId: null,
    stageId: null,
    key,
    version: 1,
    kind: "question_bank",
    title: key,
    bodyMd: "x",
    contentHash: `h-${key}`,
    sourceHash: `h-${key}`,
    origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(opportunityId, key, [
    {
      opportunityId,
      artifactId: artifact.id,
      artifactVersion: 1,
      artifactKey: key,
      number: 1,
      position: 0,
      question: text,
      questionKey: questionKey(text),
    },
  ]);
  return questionKey(text);
}

const input = (opportunityId: string | null, over: Partial<MarkInput> = {}): MarkInput => ({
  scope: "job",
  opportunityId,
  questionKey: KEY,
  level: "okay",
  markedAt: new Date("2026-02-01T10:00:00Z"),
  drilled: false,
  ...over,
});

describe("markQuestion", () => {
  it("creates a job mark with marked_at and drill_count 0", async () => {
    const { s, close, opportunityId } = await setup("mk1@example.com");
    try {
      await addQuestion(s, opportunityId);
      const view = expectOk(await markQuestion(s, input(opportunityId), NOW));
      expect(view).toEqual({
        level: "okay",
        markedAt: new Date("2026-02-01T10:00:00Z"),
        drillCount: 0,
        lastDrilledAt: null,
        applied: true,
      });
    } finally {
      await close();
    }
  });

  it("a newer markedAt replaces the level; an older one does not; an equal one keeps the stored level", async () => {
    const { s, close, opportunityId } = await setup("mk2@example.com");
    try {
      await addQuestion(s, opportunityId);
      expectOk(await markQuestion(s, input(opportunityId, { level: "okay" }), NOW));
      const newer = expectOk(
        await markQuestion(s, input(opportunityId, { level: "solid", markedAt: new Date("2026-02-01T11:00:00Z") }), NOW),
      );
      expect(newer.level).toBe("solid");
      const older = expectOk(
        await markQuestion(s, input(opportunityId, { level: "shaky", markedAt: new Date("2026-02-01T09:00:00Z") }), NOW),
      );
      expect(older.level).toBe("solid");
      const equal = expectOk(
        await markQuestion(s, input(opportunityId, { level: "shaky", markedAt: new Date("2026-02-01T11:00:00Z") }), NOW),
      );
      expect(equal.level).toBe("solid");
    } finally {
      await close();
    }
  });

  it("drilled true adds 1 to drill_count and moves last_drilled_at even when the level loses the conflict", async () => {
    const { s, close, opportunityId } = await setup("mk3@example.com");
    try {
      await addQuestion(s, opportunityId);
      expectOk(await markQuestion(s, input(opportunityId, { level: "solid", markedAt: new Date("2026-02-01T11:00:00Z") }), NOW));
      const view = expectOk(
        await markQuestion(
          s,
          input(opportunityId, { level: "shaky", markedAt: new Date("2026-02-01T09:00:00Z"), drilled: true }),
          NOW,
        ),
      );
      expect(view.level).toBe("solid");
      expect(view.drillCount).toBe(1);
      expect(view.lastDrilledAt).toEqual(new Date("2026-02-01T09:00:00Z"));
    } finally {
      await close();
    }
  });

  it("returns applied false when the stored mark is newer", async () => {
    const { s, close, opportunityId } = await setup("mk4@example.com");
    try {
      await addQuestion(s, opportunityId);
      expectOk(await markQuestion(s, input(opportunityId, { markedAt: new Date("2026-02-01T11:00:00Z") }), NOW));
      const view = expectOk(
        await markQuestion(s, input(opportunityId, { level: "shaky", markedAt: new Date("2026-02-01T09:00:00Z") }), NOW),
      );
      expect(view.applied).toBe(false);
    } finally {
      await close();
    }
  });

  it("the same question text under two jobs is two marks", async () => {
    const { s, close, opportunityId } = await setup("mk5@example.com");
    try {
      const other = expectOk(await createOpportunity(s, { companyName: "Contoso Goods", roleTitle: "Designer" })).id;
      await addQuestion(s, opportunityId);
      await addQuestion(s, other);
      expectOk(await markQuestion(s, input(opportunityId, { level: "solid" }), NOW));
      expectOk(await markQuestion(s, input(other, { level: "shaky" }), NOW));
      expect((await s.prepMark.find("job", opportunityId, KEY))?.level).toBe("solid");
      expect((await s.prepMark.find("job", other, KEY))?.level).toBe("shaky");
    } finally {
      await close();
    }
  });

  it("a job mark needs an opportunityId and a question key that exists in that job: otherwise invalid or not_found", async () => {
    const { s, close, opportunityId } = await setup("mk6@example.com");
    try {
      await addQuestion(s, opportunityId);
      expectFail(await markQuestion(s, input(null), NOW), "invalid");
      expectFail(await markQuestion(s, input(opportunityId, { questionKey: questionKey("Not in this job") }), NOW), "not_found");
    } finally {
      await close();
    }
  });

  it("a library mark accepts a key present in any of the user's question rows or library items", async () => {
    const { s, close, opportunityId } = await setup("mk7@example.com");
    try {
      await addQuestion(s, opportunityId);
      expectOk(await markQuestion(s, input(null, { scope: "library" }), NOW));

      const fromItem = questionKey("Why us?");
      expectFail(await markQuestion(s, input(null, { scope: "library", questionKey: fromItem }), NOW), "not_found");
      await s.libraryItem.insert({
        kind: "answer",
        title: "Why us",
        bodyMd: "Because.",
        questionKey: fromItem,
        archivedAt: new Date("2026-01-01T00:00:00Z"),
      });
      expectOk(await markQuestion(s, input(null, { scope: "library", questionKey: fromItem }), NOW));
      // A library mark never carries a job.
      expectFail(await markQuestion(s, input(opportunityId, { scope: "library" }), NOW), "invalid");
    } finally {
      await close();
    }
  });

  it("another user's opportunity id is not_found", async () => {
    const mine = await setup("mk8a@example.com");
    try {
      const other = scoped(mine.db, (await createTestUser(mine.db, "mk8b@example.com")).id);
      const theirs = expectOk(await createOpportunity(other, { companyName: "Contoso Goods", roleTitle: "Designer" })).id;
      await addQuestion(other, theirs);
      expectFail(await markQuestion(mine.s, input(theirs), NOW), "not_found");
      expect(await other.prepMark.listForJob(theirs)).toEqual([]);
    } finally {
      await mine.close();
    }
  });

  it("a markedAt more than 5 minutes in the future is clamped to now", async () => {
    const { s, close, opportunityId } = await setup("mk9@example.com");
    try {
      await addQuestion(s, opportunityId);
      const view = expectOk(
        await markQuestion(s, input(opportunityId, { markedAt: new Date("2030-01-01T00:00:00Z") }), NOW),
      );
      expect(view.markedAt).toEqual(NOW);
      // Four minutes ahead is a plausible clock skew and is kept.
      const skew = new Date(NOW.getTime() + 4 * 60_000);
      const kept = expectOk(await markQuestion(s, input(opportunityId, { level: "solid", markedAt: skew }), NOW));
      expect(kept.markedAt).toEqual(skew);
    } finally {
      await close();
    }
  });

  it("markInputSchema rejects a malformed question key with an explicit message", () => {
    const parsed = markInputSchema.safeParse({
      scope: "job",
      opportunityId: null,
      questionKey: "NOT-A-KEY",
      level: "solid",
      markedAt: "2026-02-01T10:00:00Z",
      drilled: false,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("That question key is not valid.");
    }
    const good = markInputSchema.parse({
      scope: "job",
      opportunityId: crypto.randomUUID(),
      questionKey: KEY,
      level: "solid",
      markedAt: "2026-02-01T10:00:00Z",
      drilled: true,
    });
    expect(good.markedAt).toEqual(new Date("2026-02-01T10:00:00Z"));
  });

  it("is the only caller of applyMark in lib and app", () => {
    const root = path.resolve(__dirname, "../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && readFileSync(full, "utf8").includes("applyMark(")) {
          hits.push(path.relative(root, full));
        }
      }
    };
    walk(path.join(root, "lib"));
    walk(path.join(root, "app"));
    expect(hits.sort()).toEqual(["lib/db/scoped/prep-mark.ts", "lib/prep/marks.ts"]);
  });
});
