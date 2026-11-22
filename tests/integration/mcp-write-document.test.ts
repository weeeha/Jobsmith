import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { BridgeDeps } from "@/lib/bridge/auth";
import { writeDocument } from "@/lib/mcp/tools/write-document";
import type { ToolContext } from "@/lib/mcp/registry";

const NOW = new Date("2026-11-21T12:00:00.000Z");

async function setup() {
  const { db, close } = await makeTestDb();
  const a = await createTestUser(db, "a@example.com");
  const b = await createTestUser(db, "b@example.com");
  const s = scoped(db, a.id);
  const company = await s.company.insert({ name: "Acme", nameKey: "acme" });
  const opp = await s.opportunity.insert({ companyId: company.id, slug: "acme-lead", roleTitle: "Lead", postingMd: "B" });
  const revalidated: string[] = [];
  const deps: BridgeDeps = { db, now: () => NOW, revalidate: (p) => revalidated.push(p), requestId: () => "req" };
  const call = (userId: string, raw: Record<string, unknown>) => {
    const ctx: ToolContext = { s: scoped(db, userId), deps, requestId: "req-t", now: NOW };
    return writeDocument.handler(ctx, writeDocument.input.parse(raw));
  };
  return { db, deps, close, a, b, s, opp, revalidated, call };
}

const base = { slug: "acme-lead", key: "cv", kind: "cv", body_md: "# CV" };

describe("write_document", () => {
  it("the first write reports created, version 1, and the version's origin is pushed", async () => {
    const { close, a, s, opp, call } = await setup();
    try {
      const out = await call(a.id, base);
      expect(out).toMatchObject({ ok: true, structured: { key: "cv", scope: "opportunity", status: "created", version: 1, warnings: [] } });
      const row = await s.artifact.getLatest({ opportunityId: opp.id }, "cv");
      expect(row?.origin).toBe("pushed");
      expect(row?.version).toBe(1);
    } finally {
      await close();
    }
  });

  it("a second write with the same body reports unchanged and version 1", async () => {
    const { close, a, call } = await setup();
    try {
      await call(a.id, base);
      const out = await call(a.id, base);
      expect(out).toMatchObject({ ok: true, structured: { status: "unchanged", version: 1 } });
    } finally {
      await close();
    }
  });

  it("a changed body reports versioned and version 2", async () => {
    const { close, a, call } = await setup();
    try {
      await call(a.id, base);
      const out = await call(a.id, { ...base, body_md: "# CV two" });
      expect(out).toMatchObject({ ok: true, structured: { status: "versioned", version: 2 } });
    } finally {
      await close();
    }
  });

  it("dry_run changes nothing and revalidates nothing", async () => {
    const { close, a, s, opp, call, revalidated } = await setup();
    try {
      const out = await call(a.id, { ...base, dry_run: true });
      expect(out).toMatchObject({ ok: true, structured: { status: "created", version: 1 } });
      expect(await s.artifact.getLatest({ opportunityId: opp.id }, "cv")).toBeNull();
      expect(revalidated).toEqual([]);
    } finally {
      await close();
    }
  });

  it("an unknown kind is stored as other and returns warning unknown_kind", async () => {
    const { close, a, s, opp, call } = await setup();
    try {
      const out = await call(a.id, { ...base, kind: "mystery" });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const warnings = (out.structured as { warnings: { code: string }[] }).warnings;
      expect(warnings.map((w) => w.code)).toContain("unknown_kind");
      expect((await s.artifact.getLatest({ opportunityId: opp.id }, "cv"))?.kind).toBe("other");
    } finally {
      await close();
    }
  });

  it("a sent version's metadata change is reported unchanged with warning sent_locked", async () => {
    const { close, a, s, opp, call } = await setup();
    try {
      await call(a.id, { ...base, title: "First" });
      const row = await s.artifact.getLatest({ opportunityId: opp.id }, "cv");
      await s.artifact.update(row!.id, { sentAt: NOW });
      const out = await call(a.id, { ...base, title: "Renamed" });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const st = out.structured as { status: string; version: number; warnings: { code: string }[] };
      expect(st.status).toBe("unchanged");
      expect(st.version).toBe(1);
      expect(st.warnings.map((w) => w.code)).toContain("sent_locked");
    } finally {
      await close();
    }
  });

  it("body_md of 1 MiB passes and 1 MiB plus one byte fails the input schema", async () => {
    const { close, a, call } = await setup();
    try {
      const ok1 = writeDocument.input.safeParse({ ...base, body_md: "a".repeat(1_048_576) });
      expect(ok1.success).toBe(true);
      expect(writeDocument.input.safeParse({ ...base, body_md: "a".repeat(1_048_577) }).success).toBe(false);
      const out = await call(a.id, { ...base, body_md: "a".repeat(1_048_576) });
      expect(out.ok).toBe(true);
    } finally {
      await close();
    }
  });

  it("another user's slug returns not_found; an empty body returns invalid", async () => {
    const { db, deps, close, a, b, call } = await setup();
    try {
      expect(await call(b.id, base)).toMatchObject({ ok: false, code: "not_found" });
      expect(writeDocument.input.safeParse({ ...base, body_md: "   " }).success).toBe(false);
      // Past the schema, the shared push still refuses an empty body.
      const ctx: ToolContext = { s: scoped(db, a.id), deps, requestId: "x", now: NOW };
      const out = await writeDocument.handler(ctx, { ...base, body_md: "   " } as never);
      expect(out).toMatchObject({ ok: false, code: "invalid" });
    } finally {
      await close();
    }
  });

  it("declares idempotentHint true and destructiveHint false", () => {
    expect(writeDocument.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  });
});
