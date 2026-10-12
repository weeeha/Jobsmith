import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import { scoped, type Scoped } from "@/lib/db/scoped";
import type { AiDriver } from "@/lib/ai/driver";
import { createFakeDriver } from "@/lib/ai/fake";
import { parseStoredFit } from "@/lib/fit/stored";
import { queueFitScoring, scoreOpportunity, scoreSafely } from "@/lib/fit/score-opportunity";
import type { FitDeps } from "@/lib/fit/deps";
import { createOpportunity } from "@/lib/pipeline/create";
import { parsePreferences } from "@/lib/preferences/schema";
import { createTestUser, makeTestDb } from "../helpers/db";
import { readResumeFixture, seedProfile } from "../helpers/profile";

const NOW = new Date("2026-10-11T20:30:00.000Z");
const POSTING = "About the job\nWe are looking for a designer who enjoys internal tools.";

function depsWith(ai: AiDriver | null): FitDeps {
  return { ai, now: () => NOW };
}

async function setup(options: { posting?: string | null; profile?: Parameters<typeof seedProfile>[1] | false } = {}) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, "owner@example.com");
  const s = scoped(db, user.id);
  if (options.profile !== false) await seedProfile(s, options.profile);
  const posting = options.posting === undefined ? POSTING : options.posting;
  const created = await createOpportunity(s, {
    companyName: "Northwind Traders",
    roleTitle: "Product Designer",
    ...(posting === null ? {} : { postingText: posting }),
  });
  if (!created.ok) throw new Error(created.message);
  return { db, close, s, id: created.data.id };
}

async function stored(s: Scoped, id: string) {
  const row = await s.opportunity.getById(id);
  if (!row) throw new Error("job missing");
  return { fitStatus: row.fitStatus, fitScore: row.fitScore, fit: row.fit, updatedAt: row.updatedAt };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("queueFitScoring", () => {
  it("sets pending and says ready when AI is on and the job has a posting and a resume", async () => {
    const { s, id, close } = await setup();
    try {
      expect(await queueFitScoring(s, id, depsWith(createFakeDriver()))).toBe("ready");
      expect((await stored(s, id)).fitStatus).toBe("pending");
    } finally {
      await close();
    }
  });

  it("changes nothing and names the reason when AI is off", async () => {
    const { s, id, close } = await setup();
    try {
      expect(await queueFitScoring(s, id, depsWith(null))).toBe("ai_off");
      expect((await stored(s, id)).fitStatus).toBe("none");
    } finally {
      await close();
    }
  });

  it("changes nothing when the job has no posting", async () => {
    const { s, id, close } = await setup({ posting: null });
    try {
      expect(await queueFitScoring(s, id, depsWith(createFakeDriver()))).toBe("no_posting");
      expect((await stored(s, id)).fitStatus).toBe("none");
    } finally {
      await close();
    }
  });

  it("changes nothing when the profile has no resume, or no profile row at all", async () => {
    const withoutResume = await setup({ profile: { resumeMd: null } });
    try {
      expect(await queueFitScoring(withoutResume.s, withoutResume.id, depsWith(createFakeDriver()))).toBe("no_resume");
      expect((await stored(withoutResume.s, withoutResume.id)).fitStatus).toBe("none");
    } finally {
      await withoutResume.close();
    }
    const withoutProfile = await setup({ profile: false });
    try {
      expect(await queueFitScoring(withoutProfile.s, withoutProfile.id, depsWith(createFakeDriver()))).toBe("no_resume");
    } finally {
      await withoutProfile.close();
    }
  });

  it("says not_found for an unknown id and for another user's job", async () => {
    const { db, s, id, close } = await setup();
    try {
      const other = scoped(db, (await createTestUser(db, "other@example.com")).id);
      expect(await queueFitScoring(other, id, depsWith(createFakeDriver()))).toBe("not_found");
      expect(await queueFitScoring(s, "00000000-0000-4000-8000-000000000000", depsWith(createFakeDriver()))).toBe("not_found");
      expect((await stored(s, id)).fitStatus).toBe("none");
    } finally {
      await close();
    }
  });
});

describe("scoreOpportunity", () => {
  it("stores the score, the fit document, the model id and the time, and reports done", async () => {
    const { s, id, close } = await setup({ posting: `Fit score: 81\n${POSTING}` });
    try {
      const result = await scoreOpportunity(s, id, depsWith(createFakeDriver()));
      expect(result).toEqual({ ok: true, data: { status: "done", score: 81 } });
      const row = await stored(s, id);
      expect(row).toMatchObject({ fitStatus: "done", fitScore: 81 });
      expect(parseStoredFit(row.fit)).toEqual({
        v: 1,
        score: 81,
        summary: "A test score from the fake driver.",
        pros: ["The role matches your titles."],
        cons: ["The posting does not state pay."],
        modelId: "fake-extractor",
        scoredAt: "2026-10-11T20:30:00.000Z",
      });
    } finally {
      await close();
    }
  });

  it("sends the company, posting, resume, headline and preferences to the model", async () => {
    const { s, id, close } = await setup({
      profile: { headline: "Product designer, design systems", preferences: parsePreferences({ titles: ["Product Designer"], compFloor: 100 }) },
    });
    try {
      const driver = createFakeDriver();
      await scoreOpportunity(s, id, depsWith(driver));
      expect(driver.calls).toHaveLength(1);
      const request = driver.calls[0]!;
      expect(request.task).toBe("score_fit");
      expect(request.userId).toBe(s.userId);
      expect(request.prompt).toContain("Role: Product Designer\nCompany: Northwind Traders\n");
      expect(request.prompt).toContain(POSTING);
      expect(request.prompt).toContain(`Product designer, design systems\n\n${readResumeFixture()}`);
      expect(request.prompt).toContain("Job titles: Product Designer\nPay floor: 100");
    } finally {
      await close();
    }
  });

  it("marks the job failed when the model fails, and keeps the previous score", async () => {
    const { s, id, close } = await setup({ posting: `Fit score: 81\n${POSTING}` });
    try {
      await scoreOpportunity(s, id, depsWith(createFakeDriver()));
      const before = await stored(s, id);
      const failing = createFakeDriver({ score_fit: () => ({ error: "ai_timeout" }) });
      const result = await scoreOpportunity(s, id, depsWith(failing));
      expect(result).toEqual({ ok: true, data: { status: "failed", score: null } });
      const after = await stored(s, id);
      expect(after.fitStatus).toBe("failed");
      expect(after.fitScore).toBe(81);
      expect(after.fit).toEqual(before.fit);
    } finally {
      await close();
    }
  });

  it("marks the job failed when the output cannot be used", async () => {
    const { s, id, close } = await setup();
    try {
      const blank = createFakeDriver({ score_fit: () => ({ score: 50, summary: " ", pros: [], cons: [] }) });
      expect(await scoreOpportunity(s, id, depsWith(blank))).toEqual({ ok: true, data: { status: "failed", score: null } });
      expect((await stored(s, id)).fitStatus).toBe("failed");
    } finally {
      await close();
    }
  });

  it("resets to none when the job is no longer ready, and keeps the previous score", async () => {
    const { s, id, close } = await setup({ posting: `Fit score: 81\n${POSTING}` });
    try {
      await scoreOpportunity(s, id, depsWith(createFakeDriver()));
      await s.profile.upsert({ resumeMd: null });
      await s.opportunity.update(id, { fitStatus: "pending" });
      const result = await scoreOpportunity(s, id, depsWith(createFakeDriver()));
      expect(result).toEqual({ ok: true, data: { status: "none", score: null } });
      expect(await stored(s, id)).toMatchObject({ fitStatus: "none", fitScore: 81 });
    } finally {
      await close();
    }
  });

  it("does not call the model when the job is not ready", async () => {
    const { s, id, close } = await setup({ posting: null });
    try {
      const driver = createFakeDriver();
      await scoreOpportunity(s, id, depsWith(driver));
      expect(driver.calls).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("is not_found for an unknown id and for another user's job", async () => {
    const { db, s, id, close } = await setup();
    try {
      const other = scoped(db, (await createTestUser(db, "other@example.com")).id);
      expect(await scoreOpportunity(other, id, depsWith(createFakeDriver()))).toMatchObject({ ok: false, code: "not_found" });
      expect(await scoreOpportunity(s, "00000000-0000-4000-8000-000000000000", depsWith(createFakeDriver()))).toMatchObject({ ok: false, code: "not_found" });
    } finally {
      await close();
    }
  });

  it("logs one line per run with the outcome, the model and the token counts, and no text", async () => {
    const { s, id, close } = await setup({ posting: `Fit score: 81\n${POSTING}` });
    try {
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      await scoreOpportunity(s, id, depsWith(createFakeDriver()));
      expect(info).toHaveBeenCalledTimes(1);
      const [tag, body] = info.mock.calls[0] as [string, string];
      expect(tag).toBe("[fit]");
      expect(JSON.parse(body)).toEqual({
        opportunityId: id,
        outcome: "done",
        reason: null,
        modelId: "fake-extractor",
        ms: 0,
        inputTokens: null,
        outputTokens: null,
      });
      expect(body).not.toContain("internal tools");
    } finally {
      await close();
    }
  });

  it("logs the reason for a run that did not score", async () => {
    const { s, id, close } = await setup();
    try {
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      await scoreOpportunity(s, id, depsWith(createFakeDriver({ score_fit: () => ({ error: "ai_timeout" }) })));
      expect(JSON.parse((info.mock.calls[0] as [string, string])[1])).toMatchObject({ outcome: "failed", reason: "ai_timeout", modelId: null });
    } finally {
      await close();
    }
  });
});

describe("scoreSafely", () => {
  const throwing: AiDriver = {
    name: "fake",
    modelId: "fake-extractor",
    generate: async () => {
      throw new Error("SECRET-POSTING-TEXT");
    },
  };

  function loggedText(): string {
    return JSON.stringify([...vi.mocked(console.info).mock.calls, ...vi.mocked(console.error).mock.calls]);
  }

  it("returns the run when scoring works", async () => {
    const { s, id, close } = await setup();
    try {
      vi.spyOn(console, "info").mockImplementation(() => {});
      expect(await scoreSafely(s, id, depsWith(createFakeDriver()))).toEqual({ status: "done", score: 64 });
    } finally {
      await close();
    }
  });

  it("never throws, ends in failed instead of pending, and logs no text when the driver throws", async () => {
    const { s, id, close } = await setup();
    try {
      vi.spyOn(console, "info").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      const deps = depsWith(throwing);
      expect(await queueFitScoring(s, id, deps)).toBe("ready");
      expect((await stored(s, id)).fitStatus).toBe("pending");

      expect(await scoreSafely(s, id, deps)).toEqual({ status: "failed", score: null });

      expect((await stored(s, id)).fitStatus).toBe("failed");
      expect(loggedText()).not.toContain("SECRET");
      expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
      expect(JSON.parse((vi.mocked(console.error).mock.calls[0] as [string, string])[1])).toEqual({ error: "Error" });
    } finally {
      await close();
    }
  });

  it("returns null for a job that does not exist", async () => {
    const { s, close } = await setup();
    try {
      expect(await scoreSafely(s, "00000000-0000-4000-8000-000000000000", depsWith(createFakeDriver()))).toBeNull();
    } finally {
      await close();
    }
  });

  it("still ends in failed when the database refuses the score write, logging only name, code and constraint", async () => {
    const { s, id, close } = await setup();
    try {
      vi.spyOn(console, "info").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      const cause = Object.assign(new Error("check violated SECRET-POSTING-TEXT"), { code: "23514", constraint: "opportunity_fit_score_check" });
      let writes = 0;
      const flaky: Scoped = {
        ...s,
        opportunity: {
          ...s.opportunity,
          update: async (...args: Parameters<Scoped["opportunity"]["update"]>) => {
            writes += 1;
            // The first write is the score; the second is the fallback to failed.
            if (writes === 1) throw new DrizzleQueryError('update "opportunity" set "fit" = $1 -- SECRET-POSTING-TEXT', ["SECRET-POSTING-TEXT"], cause);
            return s.opportunity.update(...args);
          },
        },
      };
      await s.opportunity.update(id, { fitStatus: "pending" });
      writes = 0;
      expect(await scoreSafely(flaky, id, depsWith(createFakeDriver()))).toEqual({ status: "failed", score: null });
      expect((await stored(s, id)).fitStatus).toBe("failed");
      expect(JSON.parse((vi.mocked(console.error).mock.calls[0] as [string, string])[1])).toEqual({
        error: "DrizzleQueryError",
        code: "23514",
        constraint: "opportunity_fit_score_check",
      });
      expect(loggedText()).not.toContain("SECRET");
    } finally {
      await close();
    }
  });

  it("does not throw even when the fallback write fails too", async () => {
    const { s, id, close } = await setup();
    try {
      vi.spyOn(console, "info").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      const broken: Scoped = {
        ...s,
        opportunity: { ...s.opportunity, update: async () => { throw new Error("SECRET-POSTING-TEXT"); } },
      };
      await expect(scoreSafely(broken, id, depsWith(createFakeDriver()))).resolves.toEqual({ status: "failed", score: null });
      expect(vi.mocked(console.error)).toHaveBeenCalledTimes(2);
      expect(loggedText()).not.toContain("SECRET");
    } finally {
      await close();
    }
  });
});
