import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { upsertArtifacts, type IncomingArtifact } from "@/lib/artifacts/upsert";
import { saveArtifactEdit } from "@/lib/artifacts/edit";
import { rebuildForJob } from "@/lib/prep/rebuild";
import { expectOk } from "../helpers/result";

const FIXTURES = path.resolve(__dirname, "../fixtures");
const BANK_V1 = readFileSync(path.join(FIXTURES, "prep/nwt-answers-full.md"), "utf8");
const BANK_V2 = readFileSync(path.join(FIXTURES, "prep/v2/nwt-answers-full.md"), "utf8");
const CALL_CARD = readFileSync(path.join(FIXTURES, "packet/nwl-call-card.md"), "utf8");

const bank = (bodyMd: string, over: Partial<IncomingArtifact> = {}): IncomingArtifact => ({
  key: "answers-full",
  kind: "question_bank",
  title: null,
  scope: "opportunity",
  stage: null,
  bodyMd,
  ...over,
});

const push = (s: Scoped, opportunityId: string, inputs: IncomingArtifact[], day = 1) =>
  upsertArtifacts(s, opportunityId, inputs, { origin: "pushed", now: new Date(`2026-01-0${day}T00:00:00Z`) });

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const created = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Designer" }));
  return { db, s, close, opportunityId: created.id };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rebuild on every artifact write", () => {
  it("a pushed question bank writes rows with the artifact's id, version, key and stage", async () => {
    const { s, close, opportunityId } = await setup("rb1@example.com");
    try {
      const stages = await s.stage.listForOpportunity(opportunityId);
      const stage = stages[1];
      expectOk(await push(s, opportunityId, [bank(BANK_V1, { stage: { ref: stage.label } })]));
      const artifact = await s.artifact.getLatest({ opportunityId }, "answers-full");
      const rows = await s.prepQuestion.listForJob(opportunityId);
      expect(rows).toHaveLength(7);
      for (const row of rows) {
        expect(row.artifactId).toBe(artifact!.id);
        expect(row.artifactVersion).toBe(1);
        expect(row.artifactKey).toBe("answers-full");
        expect(row.stageId).toBe(stage.id);
      }
      expect(rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    } finally {
      await close();
    }
  });

  it("a new version replaces every row of that key and leaves other keys alone", async () => {
    const { s, close, opportunityId } = await setup("rb2@example.com");
    try {
      expectOk(await push(s, opportunityId, [bank(BANK_V1), bank('### 1. "Only one"\n**Say:** hi', { key: "other-bank" })]));
      const before = await s.prepQuestion.listForArtifactKey(opportunityId, "other-bank");
      expectOk(await push(s, opportunityId, [bank(BANK_V2)], 2));
      const rows = await s.prepQuestion.listForArtifactKey(opportunityId, "answers-full");
      expect(rows).toHaveLength(7);
      expect(new Set(rows.map((r) => r.artifactVersion))).toEqual(new Set([2]));
      expect(rows[0].blocks[0].text).toContain("turns clear");
      const after = await s.prepQuestion.listForArtifactKey(opportunityId, "other-bank");
      expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    } finally {
      await close();
    }
  });

  it("marks survive a rebuild: the same question text keeps its level after version 2", async () => {
    const { s, close, opportunityId } = await setup("rb3@example.com");
    try {
      expectOk(await push(s, opportunityId, [bank(BANK_V1)]));
      const [first] = await s.prepQuestion.listForJob(opportunityId);
      await s.prepMark.applyMark({
        scope: "job",
        opportunityId,
        questionKey: first.questionKey,
        level: "solid",
        markedAt: new Date("2026-01-01T12:00:00Z"),
        drilled: false,
      });
      expectOk(await push(s, opportunityId, [bank(BANK_V2)], 2));
      const rows = await s.prepQuestion.listForJob(opportunityId);
      expect(rows.find((r) => r.number === 1)!.questionKey).toBe(first.questionKey);
      const mark = await s.prepMark.find("job", opportunityId, first.questionKey);
      expect(mark?.level).toBe("solid");
    } finally {
      await close();
    }
  });

  it("a call_card with no questions writes no rows", async () => {
    const { s, close, opportunityId } = await setup("rb4@example.com");
    try {
      expectOk(await push(s, opportunityId, [{ ...bank(CALL_CARD), key: "call-card", kind: "call_card" }]));
      expect(await s.prepQuestion.listForJob(opportunityId)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("a question_bank with no questions writes no rows and does not throw", async () => {
    const { s, close, opportunityId } = await setup("rb5@example.com");
    try {
      expectOk(await push(s, opportunityId, [bank("# Notes\n\nNo questions here.")]));
      expect(await s.prepQuestion.listForJob(opportunityId)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("a cv writes no prep rows", async () => {
    const { s, close, opportunityId } = await setup("rb6@example.com");
    try {
      expectOk(await push(s, opportunityId, [bank(BANK_V1, { key: "cv", kind: "cv" })]));
      expect(await s.prepQuestion.listForJob(opportunityId)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("an unchanged push does not touch the rows", async () => {
    const { s, close, opportunityId } = await setup("rb7@example.com");
    try {
      expectOk(await push(s, opportunityId, [bank(BANK_V1)]));
      const before = (await s.prepQuestion.listForJob(opportunityId)).map((r) => r.id);
      const second = expectOk(await push(s, opportunityId, [bank(BANK_V1)], 2));
      expect(second.results[0].status).toBe("unchanged");
      const after = (await s.prepQuestion.listForJob(opportunityId)).map((r) => r.id);
      expect(after).toEqual(before);
    } finally {
      await close();
    }
  });

  it("an in-place edit through saveArtifactEdit rebuilds from the edited body", async () => {
    const { s, close, opportunityId } = await setup("rb8@example.com");
    try {
      expectOk(await push(s, opportunityId, [bank(BANK_V1)]));
      const edited = expectOk(
        await saveArtifactEdit(
          s,
          opportunityId,
          { scope: "opportunity", key: "answers-full" },
          '### 1. "Only edited"\n\n**Say:** Edited answer.\n',
          1,
          new Date("2026-01-02T00:00:00Z"),
        ),
      );
      expect(edited.status).toBe("edited");
      const rows = await s.prepQuestion.listForJob(opportunityId);
      expect(rows.map((r) => r.question)).toEqual(["Only edited"]);
    } finally {
      await close();
    }
  });

  it("a forked manual edit versions and rebuilds under the new version", async () => {
    const { s, close, opportunityId } = await setup("rb8b@example.com");
    try {
      expectOk(await push(s, opportunityId, [bank(BANK_V1)]));
      expectOk(await push(s, opportunityId, [bank(BANK_V2)], 2));
      // Stale base version 1: the save forks version 3.
      const forked = expectOk(
        await saveArtifactEdit(
          s,
          opportunityId,
          { scope: "opportunity", key: "answers-full" },
          '### 1. "Forked"\n\n**Say:** Forked.\n',
          1,
          new Date("2026-01-03T00:00:00Z"),
        ),
      );
      expect(forked.status).toBe("versioned");
      const rows = await s.prepQuestion.listForJob(opportunityId);
      expect(rows.map((r) => [r.question, r.artifactVersion])).toEqual([["Forked", 3]]);
    } finally {
      await close();
    }
  });

  it("a stage change with an unchanged body updates stage_id on the rows", async () => {
    const { s, close, opportunityId } = await setup("rb9@example.com");
    try {
      const stages = await s.stage.listForOpportunity(opportunityId);
      expectOk(await push(s, opportunityId, [bank(BANK_V1, { stage: { ref: stages[1].label } })]));
      const moved = expectOk(await push(s, opportunityId, [bank(BANK_V1, { stage: { ref: stages[2].label } })], 2));
      expect(moved.results[0].status).toBe("updated");
      const rows = await s.prepQuestion.listForJob(opportunityId);
      expect(rows).toHaveLength(7);
      expect(new Set(rows.map((r) => r.stageId))).toEqual(new Set([stages[2].id]));
    } finally {
      await close();
    }
  });

  it("changing the kind away from question_bank deletes its rows", async () => {
    const { s, close, opportunityId } = await setup("rb10@example.com");
    try {
      expectOk(await push(s, opportunityId, [bank(BANK_V1)]));
      expect(await s.prepQuestion.listForJob(opportunityId)).toHaveLength(7);
      const changed = expectOk(await push(s, opportunityId, [bank(BANK_V1, { kind: "glossary" })], 2));
      expect(changed.results[0].status).toBe("updated");
      expect(await s.prepQuestion.listForJob(opportunityId)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("a dry run writes no rows", async () => {
    const { s, close, opportunityId } = await setup("rb11@example.com");
    try {
      const outcome = expectOk(
        await upsertArtifacts(s, opportunityId, [bank(BANK_V1)], { origin: "pushed", dryRun: true }),
      );
      expect(outcome.results[0].status).toBe("created");
      expect(await s.prepQuestion.listForJob(opportunityId)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("an include resolves against the same job's other documents and counts when it cannot", async () => {
    const { s, close, opportunityId } = await setup("rb12@example.com");
    try {
      // The other document goes in first, so question 6 resolves.
      expectOk(
        await push(s, opportunityId, [
          bank('### 1. "A"\n**Say:** one\n\n### 2. "Describe a conflict"\n\n**Say:** I listen first.\n', {
            key: "nwt-curveballs",
          }),
        ]),
      );
      expectOk(await push(s, opportunityId, [bank(BANK_V1)], 2));
      let rows = await s.prepQuestion.listForArtifactKey(opportunityId, "answers-full");
      let q6 = rows.find((r) => r.number === 6)!;
      expect(q6.unresolvedIncludes).toBe(0);
      expect(q6.hasAnswer).toBe(true);
      expect(q6.blocks).toEqual([{ label: "Say", spoken: true, text: "I listen first." }]);

      // A second job has no such document: the include stays a note and counts.
      const other = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Writer" }));
      expectOk(await push(s, other.id, [bank(BANK_V1)]));
      rows = await s.prepQuestion.listForArtifactKey(other.id, "answers-full");
      q6 = rows.find((r) => r.number === 6)!;
      expect(q6.unresolvedIncludes).toBe(1);
      expect(q6.hasAnswer).toBe(false);
    } finally {
      await close();
    }
  });

  it("changing an included document rebuilds the document that includes it", async () => {
    const { s, close, opportunityId } = await setup("rb12c@example.com");
    try {
      // The bank goes in first: its include of "nwt-curveballs" cannot resolve yet.
      expectOk(await push(s, opportunityId, [bank(BANK_V1)]));
      const q6 = async () => (await s.prepQuestion.listForArtifactKey(opportunityId, "answers-full")).find((r) => r.number === 6)!;
      expect((await q6()).unresolvedIncludes).toBe(1);

      expectOk(await push(s, opportunityId, [bank('### 2. "Describe a conflict"\n\n**Say:** First.\n', { key: "nwt-curveballs" })], 2));
      expect((await q6()).unresolvedIncludes).toBe(0);
      expect((await q6()).blocks).toEqual([{ label: "Say", spoken: true, text: "First." }]);

      // Editing the included document again changes the including document's rows.
      expectOk(await push(s, opportunityId, [bank('### 2. "Describe a conflict"\n\n**Say:** Second.\n', { key: "nwt-curveballs" })], 3));
      expect((await q6()).blocks).toEqual([{ label: "Say", spoken: true, text: "Second." }]);
    } finally {
      await close();
    }
  });

  it("an include finds a document pushed in the same call", async () => {
    const { s, close, opportunityId } = await setup("rb12b@example.com");
    try {
      expectOk(
        await push(s, opportunityId, [
          bank(BANK_V1),
          bank('### 2. "Describe a conflict"\n\n**Say:** Same call.\n', { key: "nwt-curveballs" }),
        ]),
      );
      const rows = await s.prepQuestion.listForArtifactKey(opportunityId, "answers-full");
      expect(rows.find((r) => r.number === 6)!.unresolvedIncludes).toBe(0);
    } finally {
      await close();
    }
  });

  it("logs one [prep] line with counts and never the question text", async () => {
    const { s, close, opportunityId } = await setup("rb13@example.com");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expectOk(await push(s, opportunityId, [bank(BANK_V1)]));
      const lines = info.mock.calls.filter((c) => c[0] === "[prep]");
      expect(lines).toHaveLength(1);
      const payload = lines[0][1] as Record<string, unknown>;
      expect(payload).toMatchObject({ opportunityId, key: "answers-full", rows: 7 });
      expect(typeof payload.warnings).toBe("number");
      expect(JSON.stringify(lines[0])).not.toContain("Tell me about yourself");
      expect(JSON.stringify(lines[0])).not.toContain("Northwind Traders sells");
    } finally {
      await close();
    }
  });

  it("rows are written inside the caller's transaction: a failure later in the transaction leaves none", async () => {
    const { s, close, opportunityId } = await setup("rb14@example.com");
    try {
      await expect(
        s.transaction(async (tx) => {
          const opportunity = (await tx.opportunity.lockById(opportunityId))!;
          const stages = await tx.stage.listForOpportunity(opportunityId);
          const { applyUpserts } = await import("@/lib/artifacts/upsert");
          await applyUpserts(tx, { opportunity, stages }, [bank(BANK_V1)], {
            origin: "pasted",
            dryRun: false,
            now: new Date("2026-01-01T00:00:00Z"),
          });
          expect(await tx.prepQuestion.listForJob(opportunityId)).toHaveLength(7);
          throw new Error("later failure");
        }),
      ).rejects.toThrow("later failure");
      expect(await s.prepQuestion.listForJob(opportunityId)).toEqual([]);
      expect(await s.artifact.getLatest({ opportunityId }, "answers-full")).toBeNull();
    } finally {
      await close();
    }
  });

  it("rebuildForJob rebuilds from the latest bodies and returns not_found for an unknown job", async () => {
    const { s, close, opportunityId } = await setup("rb15@example.com");
    try {
      expectOk(await push(s, opportunityId, [bank(BANK_V1)]));
      await s.prepQuestion.replaceForArtifactKey(opportunityId, "answers-full", []);
      const result = expectOk(await rebuildForJob(s, opportunityId));
      expect(result).toEqual({ documents: 1, rows: 7 });
      expect(await s.prepQuestion.listForJob(opportunityId)).toHaveLength(7);
      const missing = await rebuildForJob(s, crypto.randomUUID());
      expect(missing.ok).toBe(false);
    } finally {
      await close();
    }
  });
});
