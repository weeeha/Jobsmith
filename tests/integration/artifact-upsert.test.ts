import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { removeStage } from "@/lib/pipeline/stages";
import { upsertArtifacts, type IncomingArtifact } from "@/lib/artifacts/upsert";
import { expectOk, expectFail } from "../helpers/result";

// saveArtifactEdit and markArtifactSent do not exist yet when this file is
// first written and run. The three tests below that need them import each one
// dynamically, inside the test body, specifically so a missing module fails
// only that one test at the moment it runs, not the whole file at load time
// the way a static top-level import would. Every other test in this file uses
// only upsertArtifacts, which already exists by the time this file is run.

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const created = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" }));
  return { s, close, opportunityId: created.id };
}

const CV: IncomingArtifact = { key: "cv", kind: "cv", title: null, scope: "opportunity", stage: null, bodyMd: "# CV\nOriginal body" };

describe("upsertArtifacts", () => {
  it("a first push creates every artifact and writes one event; a repeat push creates nothing", async () => {
    const { s, close, opportunityId } = await setup("push1@example.com");
    try {
      const inputs: IncomingArtifact[] = [
        CV,
        { key: "cover-letter", kind: "cover_letter", title: null, scope: "opportunity", stage: null, bodyMd: "# Cover letter\nBody" },
      ];
      const first = expectOk(await upsertArtifacts(s, opportunityId, inputs, { origin: "pushed", now: new Date("2026-01-01T00:00:00Z") }));
      expect(first.results.map((r) => r.status)).toEqual(["created", "created"]);

      const eventsAfterFirst = await s.event.listForOpportunity(opportunityId);
      expect(eventsAfterFirst.filter((e) => e.kind === "artifact_pushed")).toHaveLength(1);
      const rowsAfterFirst = await s.artifact.listLatestForOpportunity(opportunityId);
      const updatedAtBefore = rowsAfterFirst.map((r) => r.updatedAt.toISOString());

      const second = expectOk(await upsertArtifacts(s, opportunityId, inputs, { origin: "pushed", now: new Date("2026-01-02T00:00:00Z") }));
      expect(second.results.map((r) => r.status)).toEqual(["unchanged", "unchanged"]);

      const rowsAfterSecond = await s.artifact.listLatestForOpportunity(opportunityId);
      expect(rowsAfterSecond).toHaveLength(rowsAfterFirst.length);
      expect(rowsAfterSecond.map((r) => r.updatedAt.toISOString())).toEqual(updatedAtBefore);
      const eventsAfterSecond = await s.event.listForOpportunity(opportunityId);
      expect(eventsAfterSecond.filter((e) => e.kind === "artifact_pushed")).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("rule 3: the same push after an in-place edit is unchanged and keeps the edit", async () => {
    const { s, close, opportunityId } = await setup("push2@example.com");
    try {
      const { saveArtifactEdit } = await import("@/lib/artifacts/edit");
      await upsertArtifacts(s, opportunityId, [CV], { origin: "pushed", now: new Date("2026-01-01T00:00:00Z") });
      const edited = expectOk(
        await saveArtifactEdit(s, opportunityId, { scope: "opportunity", key: "cv" }, "# CV\nHand-edited body", 1, new Date("2026-01-02T00:00:00Z")),
      );
      expect(edited.status).toBe("edited");

      const repeat = expectOk(await upsertArtifacts(s, opportunityId, [CV], { origin: "pushed", now: new Date("2026-01-03T00:00:00Z") }));
      expect(repeat.results[0].status).toBe("unchanged");

      const latest = await s.artifact.getLatest({ opportunityId }, "cv");
      expect(latest?.bodyMd).toBe("# CV\nHand-edited body");
      const versions = await s.artifact.listVersions({ opportunityId }, "cv");
      expect(versions).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("a changed push after an edit versions", async () => {
    const { s, close, opportunityId } = await setup("push3@example.com");
    try {
      const { saveArtifactEdit } = await import("@/lib/artifacts/edit");
      await upsertArtifacts(s, opportunityId, [CV], { origin: "pushed", now: new Date("2026-01-01T00:00:00Z") });
      await saveArtifactEdit(s, opportunityId, { scope: "opportunity", key: "cv" }, "# CV\nEdited", 1, new Date("2026-01-02T00:00:00Z"));
      const changed = expectOk(
        await upsertArtifacts(
          s,
          opportunityId,
          [{ ...CV, bodyMd: "# CV\nA genuinely new server-side version" }],
          { origin: "pushed", now: new Date("2026-01-03T00:00:00Z") },
        ),
      );
      expect(changed.results[0]).toMatchObject({ status: "versioned", version: 2 });
      const versions = await s.artifact.listVersions({ opportunityId }, "cv");
      expect(versions).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("two jobs at one company both list a company-scoped push", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "push4@example.com");
      const s = scoped(db, user.id);
      const jobA = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" }));
      const jobB = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Writer" }));

      await upsertArtifacts(
        s,
        jobA.id,
        [{ key: "recon", kind: "research", title: null, scope: "company", stage: null, bodyMd: "# Recon\nShared" }],
        { origin: "pushed", now: new Date("2026-01-01T00:00:00Z") },
      );

      const oppA = await s.opportunity.getById(jobA.id);
      const oppB = await s.opportunity.getById(jobB.id);
      expect(oppA?.companyId).toBe(oppB?.companyId);
      const companyDocs = await s.artifact.listLatestForCompany(oppA!.companyId);
      expect(companyDocs.map((d) => d.key)).toEqual(["recon"]);
    } finally {
      await close();
    }
  });

  it("every warning code fires exactly once and the rest of the push still saves", async () => {
    const { s, close, opportunityId } = await setup("push5@example.com");
    try {
      const inputs: IncomingArtifact[] = [
        CV,
        { key: "cv-company", kind: "cv", title: null, scope: "company", stage: null, bodyMd: "# CV\nWrong scope" },
        { key: "recon-staged", kind: "research", title: null, scope: "company", stage: { ref: "Saved" }, bodyMd: "# Recon\nstaged" },
        { key: "call-card", kind: "call_card", title: null, scope: "opportunity", stage: { ref: "Nonexistent Stage" }, bodyMd: "# Call card\nBody" },
        { key: "mystery", kind: "totally-unknown-kind", title: null, scope: "opportunity", stage: null, bodyMd: "# Mystery\nBody" },
      ];
      const outcome = expectOk(await upsertArtifacts(s, opportunityId, inputs, { origin: "pushed", now: new Date("2026-01-01T00:00:00Z") }));

      expect(outcome.results.map((r) => r.status)).toEqual(["created", "created", "created", "created", "created"]);
      expect(outcome.warnings.map((w) => w.code).sort()).toEqual(
        ["company_scope_not_allowed", "stage_ignored", "stage_not_found", "unknown_kind"].sort(),
      );

      const rows = await s.artifact.listLatestForOpportunity(opportunityId);
      expect(rows.find((r) => r.key === "mystery")?.kind).toBe("other");
      const companyCv = await s.artifact.getLatest({ opportunityId }, "cv-company");
      expect(companyCv?.opportunityId).toBe(opportunityId);
      expect(companyCv?.companyId).toBeNull();
    } finally {
      await close();
    }
  });

  it("a dry run reports the real run's statuses and writes nothing", async () => {
    const { s, close, opportunityId } = await setup("push6@example.com");
    try {
      const dry = expectOk(await upsertArtifacts(s, opportunityId, [CV], { origin: "pushed", dryRun: true, now: new Date("2026-01-01T00:00:00Z") }));
      expect(dry.results[0].status).toBe("created");
      expect(await s.artifact.listLatestForOpportunity(opportunityId)).toEqual([]);
      expect((await s.event.listForOpportunity(opportunityId)).filter((e) => e.kind === "artifact_pushed")).toHaveLength(0);

      const real = expectOk(await upsertArtifacts(s, opportunityId, [CV], { origin: "pushed", now: new Date("2026-01-01T00:00:00Z") }));
      expect(real.results[0].status).toBe(dry.results[0].status);
      expect(real.results[0].version).toBe(dry.results[0].version);
    } finally {
      await close();
    }
  });

  it("a metadata change on a sent latest is unchanged with sent_locked", async () => {
    const { s, close, opportunityId } = await setup("push7@example.com");
    try {
      await upsertArtifacts(s, opportunityId, [{ ...CV, title: "Old title" }], { origin: "pushed", now: new Date("2026-01-01T00:00:00Z") });
      const { markArtifactSent } = await import("@/lib/artifacts/sent");
      await markArtifactSent(s, opportunityId, "cv", 1, new Date("2026-01-02T00:00:00Z"));

      const locked = expectOk(
        await upsertArtifacts(s, opportunityId, [{ ...CV, title: "New title" }], { origin: "pushed", now: new Date("2026-01-03T00:00:00Z") }),
      );
      expect(locked.results[0].status).toBe("unchanged");
      expect(locked.warnings[0]?.code).toBe("sent_locked");
    } finally {
      await close();
    }
  });

  it("removeStage refuses stage_has_artifacts while a latest version holds the stage, and allows it once restaged", async () => {
    const { s, close, opportunityId } = await setup("push8@example.com");
    try {
      const stages = await s.stage.listForOpportunity(opportunityId);
      const portfolio = stages.find((st) => st.kind === "portfolio_case")!;
      const panel = stages.find((st) => st.kind === "panel_final")!;

      await upsertArtifacts(
        s,
        opportunityId,
        [{ key: "call-card", kind: "call_card", title: null, scope: "opportunity", stage: { id: portfolio.id }, bodyMd: "# Call card" }],
        { origin: "pushed", now: new Date("2026-01-01T00:00:00Z") },
      );
      expectFail(await removeStage(s, opportunityId, portfolio.id), "stage_has_artifacts");

      await upsertArtifacts(
        s,
        opportunityId,
        [{ key: "call-card", kind: "call_card", title: null, scope: "opportunity", stage: { id: panel.id }, bodyMd: "# Call card" }],
        { origin: "pushed", now: new Date("2026-01-02T00:00:00Z") },
      );
      const allowed = await removeStage(s, opportunityId, portfolio.id);
      expect(allowed.ok).toBe(true);
    } finally {
      await close();
    }
  });

  it("a stale-based edit forks a new version and never disturbs the newer push, which stays reachable by a repeat push", async () => {
    const { s, close, opportunityId } = await setup("push10@example.com");
    try {
      const { saveArtifactEdit } = await import("@/lib/artifacts/edit");
      await upsertArtifacts(s, opportunityId, [CV], { origin: "pushed", now: new Date("2026-01-01T00:00:00Z") });
      const v2Body = "# CV\nPushed while the editor was still open";
      await upsertArtifacts(s, opportunityId, [{ ...CV, bodyMd: v2Body }], { origin: "pushed", now: new Date("2026-01-02T00:00:00Z") });

      // The editor still has version 1 open (its own base version), unaware
      // that a push already landed version 2.
      const staleEdit = expectOk(
        await saveArtifactEdit(
          s,
          opportunityId,
          { scope: "opportunity", key: "cv" },
          "# CV\nEdited from the stale draft",
          1,
          new Date("2026-01-03T00:00:00Z"),
        ),
      );
      expect(staleEdit).toEqual({ status: "versioned", version: 3, title: "CV" });

      const v2 = await s.artifact.getVersion({ opportunityId }, "cv", 2);
      expect(v2?.bodyMd).toBe(v2Body);
      const v3 = await s.artifact.getVersion({ opportunityId }, "cv", 3);
      expect(v3?.bodyMd).toBe("# CV\nEdited from the stale draft");

      const rePush = expectOk(
        await upsertArtifacts(s, opportunityId, [{ ...CV, bodyMd: v2Body }], { origin: "pushed", now: new Date("2026-01-04T00:00:00Z") }),
      );
      expect(rePush.results[0].status).toBe("unchanged");
      const v2After = await s.artifact.getVersion({ opportunityId }, "cv", 2);
      expect(v2After?.bodyMd).toBe(v2Body);
      const versions = await s.artifact.listVersions({ opportunityId }, "cv");
      expect(versions).toHaveLength(3);
    } finally {
      await close();
    }
  });

  it("user B gets not_found on user A's job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice-push@example.com");
      const bob = await createTestUser(db, "bob-push@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const created = expectOk(await createOpportunity(a, { companyName: "Northwind Labs", roleTitle: "Designer" }));
      expectFail(await upsertArtifacts(b, created.id, [CV], { origin: "pushed" }), "not_found");
    } finally {
      await close();
    }
  });

  it("rejects an invalid key or a repeated key with invalid, before writing anything", async () => {
    const { s, close, opportunityId } = await setup("push9@example.com");
    try {
      expectFail(
        await upsertArtifacts(s, opportunityId, [{ ...CV, key: "Not Valid!" }], { origin: "pushed" }),
        "invalid",
      );
      expectFail(await upsertArtifacts(s, opportunityId, [CV, CV], { origin: "pushed" }), "invalid");
      expect(await s.artifact.listLatestForOpportunity(opportunityId)).toEqual([]);
    } finally {
      await close();
    }
  });
});
