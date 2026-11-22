import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { BridgeDeps } from "@/lib/bridge/auth";
import { applyPush } from "@/lib/bridge/push";

const NOW = new Date("2026-11-21T12:00:00.000Z");

async function setup() {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, "push@example.com");
  const s = scoped(db, user.id);
  const company = await s.company.insert({ name: "Acme", nameKey: "acme" });
  const one = await s.opportunity.insert({ companyId: company.id, slug: "acme-one", roleTitle: "One", postingMd: "B" });
  const two = await s.opportunity.insert({ companyId: company.id, slug: "acme-two", roleTitle: "Two", postingMd: "B" });
  const revalidated: string[] = [];
  const deps: BridgeDeps = { db, now: () => NOW, revalidate: (p) => revalidated.push(p), requestId: () => "req" };
  const push = (scope: "opportunity" | "company", body: string, dryRun = false) =>
    applyPush(deps, s, {
      opportunity: one,
      dryRun,
      now: NOW,
      inputs: [{ key: "doc", kind: scope === "company" ? "research" : "cv", title: null, scope, stage: null, bodyMd: body }],
    });
  return { s, close, one, two, revalidated, push };
}

describe("applyPush", () => {
  it("revalidates /jobs/<slug> after a change and nothing after a dry run or an unchanged push", async () => {
    const { close, revalidated, push } = await setup();
    try {
      await push("opportunity", "# A", true);
      expect(revalidated).toEqual([]);
      await push("opportunity", "# A");
      expect(revalidated).toEqual(["/jobs/acme-one"]);
      await push("opportunity", "# A");
      expect(revalidated).toEqual(["/jobs/acme-one"]);
    } finally {
      await close();
    }
  });

  it("a company-scoped change also revalidates every other job slug of that company", async () => {
    const { close, revalidated, push } = await setup();
    try {
      await push("company", "# C");
      expect([...revalidated].sort()).toEqual(["/jobs/acme-one", "/jobs/acme-two"]);
    } finally {
      await close();
    }
  });

  it("writes one artifact_pushed event for a change and none for unchanged", async () => {
    const { s, close, one, push } = await setup();
    try {
      await push("opportunity", "# A");
      await push("opportunity", "# A");
      const events = await s.event.listForOpportunity(one.id);
      expect(events.filter((e) => e.kind === "artifact_pushed")).toHaveLength(1);
    } finally {
      await close();
    }
  });
});
