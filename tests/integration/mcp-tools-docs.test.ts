import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { defaultStages } from "@/lib/pipeline/rules";
import { getProfile } from "@/lib/mcp/tools/get-profile";
import { getJobContext } from "@/lib/mcp/tools/get-job-context";
import { loadFitProfile } from "@/lib/fit/profile";
import { preferencesSummaryLines } from "@/lib/preferences/summary";
import type { ToolContext } from "@/lib/mcp/registry";

const NOW = new Date("2026-11-21T12:00:00.000Z");
const RESUME = "# Resume\nUNIQUE-RESUME-LINE-9137 led design at a studio.";

function ctxFor(db: Db, userId: string): ToolContext {
  const deps: BridgeDeps = { db, now: () => NOW, revalidate: () => {}, requestId: () => "req-t" };
  return { s: scoped(db, userId), deps, requestId: "req-t", now: NOW };
}

async function setup() {
  const { db, close } = await makeTestDb();
  const a = await createTestUser(db, "a@example.com");
  await scoped(db, a.id).profile.upsert({ headline: "Design lead", timezone: "America/Toronto", resumeMd: RESUME });
  return { db, close, a };
}

type Out = {
  headline: string | null;
  timezone: string;
  preferences: object;
  preferences_summary: string[];
  resume_chars: number;
  resume_md?: string;
};

async function call(db: Db, userId: string, raw: object) {
  const out = await getProfile.handler(ctxFor(db, userId), getProfile.input.parse(raw));
  if (!out.ok) throw new Error("failed");
  expect(getProfile.output!.safeParse(out.structured).success).toBe(true);
  return out.structured as Out;
}

describe("mcp profile and context tools", () => {
  it("get_profile omits resume_md by default, reports resume_chars, and returns it only with include_resume true", async () => {
    const { db, close, a } = await setup();
    try {
      const plain = await call(db, a.id, {});
      expect(plain).toMatchObject({ headline: "Design lead", timezone: "America/Toronto", resume_chars: RESUME.length });
      expect("resume_md" in plain).toBe(false);
      expect(JSON.stringify(plain)).not.toContain("UNIQUE-RESUME-LINE-9137");
      const withResume = await call(db, a.id, { include_resume: true });
      expect(withResume.resume_md).toBe(RESUME);
    } finally {
      await close();
    }
  });

  it("get_profile with no profile row returns defaults and resume_chars 0", async () => {
    const { db, close } = await setup();
    try {
      const b = await createTestUser(db, "b@example.com");
      const out = await call(db, b.id, { include_resume: true });
      expect(out).toMatchObject({ headline: null, timezone: "UTC", resume_chars: 0, resume_md: "" });
    } finally {
      await close();
    }
  });

  it("get_profile preferences_summary equals preferencesSummaryLines of the saved preferences", async () => {
    const { db, close, a } = await setup();
    try {
      await scoped(db, a.id).profile.upsert({ preferences: { titles: ["Design Lead"], locations: ["Montreal"], compFloor: 150000 } });
      const out = await call(db, a.id, {});
      const fit = await loadFitProfile(scoped(db, a.id));
      expect(out.preferences_summary).toEqual(preferencesSummaryLines(fit.preferences));
      expect(out.preferences_summary.length).toBeGreaterThan(0);
      expect(out.preferences).toEqual(fit.preferences);
    } finally {
      await close();
    }
  });

  it("the context document never carries resume text, checked against get_profile's resume line", async () => {
    const { db, close, a } = await setup();
    try {
      const s = scoped(db, a.id);
      const c = await s.company.insert({ name: "Acme", nameKey: "acme" });
      const opp = await s.opportunity.insert({ companyId: c.id, slug: "acme-lead", roleTitle: "Lead", postingMd: "BODY" });
      const stages = await s.stage.insertMany(
        defaultStages().map((d, i) => ({ opportunityId: opp.id, kind: d.kind, label: d.label, position: i })),
      );
      await s.opportunity.update(opp.id, { currentStageId: stages[0]!.id });
      const profile = await call(db, a.id, { include_resume: true });
      const out = await getJobContext.handler(ctxFor(db, a.id), getJobContext.input.parse({ slug: "acme-lead" }));
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.text).not.toContain("UNIQUE-RESUME-LINE-9137");
      expect(out.text).not.toContain(profile.resume_md!.split("\n")[1]!);
    } finally {
      await close();
    }
  });
});
