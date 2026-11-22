import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { bridgeFetch } from "../helpers/bridge-fetch";
import { scoped, type Scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { createApiToken } from "@/lib/auth/api-token";
import { defaultStages } from "@/lib/pipeline/rules";
import { RATE_LIMIT_PER_MINUTE, EVENTS_PAGE_DEFAULT } from "@/lib/bridge/wire";
import { listEvents } from "@/lib/bridge/events";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://test.local";
const NOW = new Date("2026-11-21T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function depsFor(db: Db, now: Date = NOW): BridgeDeps {
  let n = 0;
  return { db, now: () => now, revalidate: () => {}, requestId: () => `req-${++n}` };
}

async function seed(db: Db, email: string, slug: string) {
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const company = await s.company.insert({ name: `Co ${slug}`, nameKey: `co-${slug}` });
  const opp = await s.opportunity.insert({ companyId: company.id, slug, roleTitle: "Designer" });
  const stages = await s.stage.insertMany(
    defaultStages().map((d, i) => ({ opportunityId: opp.id, kind: d.kind, label: d.label, position: i })),
  );
  await s.opportunity.update(opp.id, { currentStageId: stages[0]!.id });
  const created = await createApiToken(s, "Test");
  if (!created.ok) throw new Error("token setup failed");
  return { s, opp, stages, token: created.data.token };
}

async function addEvent(
  db: Db,
  s: Scoped,
  oppId: string,
  createdAt: Date,
  extra: { stageId?: string | null; body?: string | null; id?: string } = {},
) {
  const row = await s.event.insert({ opportunityId: oppId, kind: "note", stageId: extra.stageId ?? null, body: extra.body ?? null });
  await db
    .update(schema.event)
    .set({ createdAt, occurredAt: createdAt, ...(extra.id ? { id: extra.id } : {}) })
    .where(eq(schema.event.id, row.id));
  return extra.id ?? row.id;
}

function get(db: Db, token: string | null, query = "", now: Date = NOW) {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return bridgeFetch(depsFor(db, now))(`${BASE}/api/bridge/events${query}`, { headers });
}

describe("bridge events feed", () => {
  it("returns events oldest first by created time then id, with slug and stage label, occurred_at and created_at as ISO strings", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opp, stages, token } = await seed(db, "a@example.com", "acme-designer");
      const second = await addEvent(db, s, opp.id, hoursAgo(2), { body: "later" });
      const first = await addEvent(db, s, opp.id, hoursAgo(3), { stageId: stages[0]!.id });
      const res = await get(db, token);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.events.map((e: { id: string }) => e.id)).toEqual([first, second]);
      expect(body.events[0]).toMatchObject({
        slug: "acme-designer",
        stage: stages[0]!.label,
        body: null,
        meta: {},
        created_at: hoursAgo(3).toISOString(),
        occurred_at: hoursAgo(3).toISOString(),
        kind: "note",
      });
      expect(body.events[1]).toMatchObject({ stage: null, body: "later" });
      expect(typeof body.next).toBe("string");
      expect(body.requestId).toBe("req-1");
    } finally {
      await close();
    }
  });

  it("with no cursor starts 24 hours before now", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opp, token } = await seed(db, "a@example.com", "acme-designer");
      await addEvent(db, s, opp.id, hoursAgo(25));
      const recent = await addEvent(db, s, opp.id, hoursAgo(23));
      const body = await (await get(db, token)).json();
      expect(body.events.map((e: { id: string }) => e.id)).toEqual([recent]);
    } finally {
      await close();
    }
  });

  it("never reaches back more than 90 days, even for a cursor older than that", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opp, token } = await seed(db, "a@example.com", "acme-designer");
      await addEvent(db, s, opp.id, hoursAgo(24 * 100));
      const inside = await addEvent(db, s, opp.id, hoursAgo(24 * 80));
      const { encodeCursor } = await import("@/lib/bridge/events");
      const old = encodeCursor(hoursAgo(24 * 200), "00000000-0000-4000-8000-000000000000");
      const body = await (await get(db, token, `?after=${old}`)).json();
      expect(body.events.map((e: { id: string }) => e.id)).toEqual([inside]);
    } finally {
      await close();
    }
  });

  it("next continues exactly: two pages over events sharing one created time yield each event once", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opp, token } = await seed(db, "a@example.com", "acme-designer");
      const at = hoursAgo(1);
      const ids = [
        await addEvent(db, s, opp.id, at),
        await addEvent(db, s, opp.id, at),
        await addEvent(db, s, opp.id, at),
      ];
      const seen: string[] = [];
      let after = "";
      for (let i = 0; i < 4; i++) {
        const body = await (await get(db, token, `?limit=1${after ? `&after=${after}` : ""}`)).json();
        for (const e of body.events) seen.push(e.id);
        after = body.next;
      }
      expect(seen).toHaveLength(3);
      expect([...seen].sort()).toEqual([...ids].sort());
      expect(seen).toEqual([...ids].sort());
    } finally {
      await close();
    }
  });

  it("an empty page returns the after that was sent, and null when none was", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opp, token } = await seed(db, "a@example.com", "acme-designer");
      expect((await (await get(db, token)).json()).next).toBeNull();
      await addEvent(db, s, opp.id, hoursAgo(1));
      const first = await (await get(db, token)).json();
      const again = await (await get(db, token, `?after=${first.next}`)).json();
      expect(again.events).toEqual([]);
      expect(again.next).toBe(first.next);
    } finally {
      await close();
    }
  });

  it("limit 0, 201 and abc answer 400 invalid_query; a cursor that is not one answers 400 invalid_query", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seed(db, "a@example.com", "acme-designer");
      for (const q of ["?limit=0", "?limit=201", "?limit=abc", "?after=%25%25notacursor"]) {
        const res = await get(db, token, q);
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("invalid_query");
      }
      expect((await get(db, token, "?limit=200")).status).toBe(200);
      expect(EVENTS_PAGE_DEFAULT).toBeLessThanOrEqual(200);
    } finally {
      await close();
    }
  });

  it("user B's token never sees user A's events", async () => {
    const { db, close } = await makeTestDb();
    try {
      const a = await seed(db, "a@example.com", "a-job");
      const b = await seed(db, "b@example.com", "b-job");
      await addEvent(db, a.s, a.opp.id, hoursAgo(1));
      const bBody = await (await get(db, b.token)).json();
      expect(bBody.events).toEqual([]);
      const aBody = await (await get(db, a.token)).json();
      expect(aBody.events).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("401 without a token; 429 over the rate window", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seed(db, "a@example.com", "acme-designer");
      expect((await get(db, null)).status).toBe(401);
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
        expect((await get(db, token)).status).toBe(200);
      }
      const over = await get(db, token);
      expect(over.status).toBe(429);
      expect((await over.json()).error.code).toBe("rate_limited");
    } finally {
      await close();
    }
  });

  it("listEvents reports a bad cursor as invalid_cursor", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s } = await seed(db, "a@example.com", "acme-designer");
      const r = await listEvents(s, { after: "zzz|", limit: 5, now: NOW });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("invalid_cursor");
    } finally {
      await close();
    }
  });
});
