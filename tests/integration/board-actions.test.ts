import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { addJobAction, moveAction } from "@/app/(app)/board/actions";
import type { AiDriver } from "@/lib/ai/driver";
import { createFakeDriver } from "@/lib/ai/fake";
import { parseStoredFit } from "@/lib/fit/stored";
import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { fakeGuardedFetch } from "../helpers/intake";
import { seedProfile } from "../helpers/profile";

// addJobAction turns the Add job form's text into numbers before
// addJobFormSchema sees it, so addJob's own tests cannot catch a bad
// conversion here: by then every pay figure is already a number or
// undefined. These tests call the action itself. The signed-in user and
// path revalidation need a live Next.js request, so both are stubbed;
// scopedFor is pointed at a real PGlite database through the real scoped();
// intakeDeps is stubbed so no test ever touches the network or a real model.
// after() only works inside a request, so it is replaced by a list of
// callbacks that each test runs (or deliberately leaves unrun); fitDeps is
// stubbed with the driver the test chooses and a fixed clock.
const harness = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  userId: "",
  throwDeps: false,
  throwQueue: false,
  ai: null as AiDriver | null,
  afterCallbacks: [] as (() => unknown)[],
  revalidated: [] as string[],
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    harness.revalidated.push(path);
  },
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: (() => unknown) | Promise<unknown>) => {
    harness.afterCallbacks.push(typeof task === "function" ? task : () => task);
  },
}));

async function runAfterCallbacks() {
  for (const callback of harness.afterCallbacks.splice(0)) await callback();
}

vi.mock("@/lib/fit/deps", () => ({
  fitDeps: () => ({ ai: harness.ai, now: () => new Date("2026-10-11T20:30:00.000Z") }),
}));

vi.mock("@/lib/fit/score-opportunity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fit/score-opportunity")>();
  return {
    ...actual,
    queueFitScoring: (...args: Parameters<typeof actual.queueFitScoring>) => {
      if (harness.throwQueue) throw new Error("SECRET-POSTING-TEXT");
      return actual.queueFitScoring(...args);
    },
  };
});

afterEach(() => {
  harness.ai = null;
  harness.afterCallbacks.length = 0;
  harness.revalidated.length = 0;
  harness.throwQueue = false;
  vi.restoreAllMocks();
});

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

vi.mock("@/lib/intake/deps", () => ({
  intakeDeps: () => {
    if (harness.throwDeps) throw new Error("deps unavailable");
    return { fetch: fakeGuardedFetch({}), ai: null, now: () => new Date("2026-09-19T12:00:00.000Z"), requestId: "test-request" };
  },
}));

async function signInAs(db: Db, email: string): Promise<void> {
  harness.db = db;
  harness.userId = (await createTestUser(db, email)).id;
}

function addJobForm(pay: Record<string, string>): FormData {
  const formData = new FormData();
  formData.set("companyName", "Acme Robotics");
  formData.set("roleTitle", "Product Designer");
  for (const [name, value] of Object.entries(pay)) formData.set(name, value);
  return formData;
}

describe("addJobAction pay figures", () => {
  it.each(["compMin", "compMax"])(
    "rejects a %s that is not a number instead of adding the job without it",
    async (field) => {
      const { db, close } = await makeTestDb();
      try {
        await signInAs(db, "adder@example.com");
        const state = await addJobAction(undefined, addJobForm({ [field]: "12k" }));
        expect(state).toMatchObject({ ok: false, code: "invalid", fieldErrors: { [field]: "Enter a number." } });
        expect(await db.select().from(schema.opportunity)).toHaveLength(0);
      } finally {
        await close();
      }
    },
  );

  // lib/forms/submit.ts sends this in place of a Pay box the browser holds
  // text for but cannot read ("12e"). Read as blank, it would add the job
  // without the figure.
  it("rejects the stand-in sent for a pay figure the browser could not read", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "adder@example.com");
      const state = await addJobAction(undefined, addJobForm({ compMin: UNREADABLE_INPUT_VALUE }));
      expect(state).toMatchObject({ ok: false, code: "invalid", fieldErrors: { compMin: "Enter a number." } });
      expect(await db.select().from(schema.opportunity)).toHaveLength(0);
    } finally {
      await close();
    }
  });

  // Number("") and Number("  ") are both 0, so a blank Pay box has to be
  // caught before Number() runs or it would be saved as a pay figure of 0.
  it("treats a blank pay figure as not given", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "adder@example.com");
      const state = await addJobAction(undefined, addJobForm({ compMin: "", compMax: "  " }));
      expect(state).toMatchObject({ ok: true, data: { companyName: "Acme Robotics", roleTitle: "Product Designer" } });
      const [row] = await db.select().from(schema.opportunity);
      expect(row).toMatchObject({ compMin: null, compMax: null });
    } finally {
      await close();
    }
  });

  it("stores a pay figure that is a number", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "adder@example.com");
      const state = await addJobAction(undefined, addJobForm({ compMin: "120000" }));
      expect(state).toMatchObject({ ok: true });
      const [row] = await db.select().from(schema.opportunity);
      expect(row).toMatchObject({ compMin: 120000 });
    } finally {
      await close();
    }
  });
});

describe("addJobAction placement", () => {
  it("places the job at the requested stage via whereIsItNow", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "placer@example.com");
      const formData = addJobForm({});
      formData.set("whereIsItNow", "recruiter_screen");
      const state = await addJobAction(undefined, formData);
      expect(state).toMatchObject({ ok: true });
      const board = await scoped(db, harness.userId).opportunity.listBoard();
      expect(board[0]?.stage.kind).toBe("recruiter_screen");
    } finally {
      await close();
    }
  });
});

describe("addJobAction needs_text", () => {
  it("gives a postingText field hint when the link cannot be read", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "linker@example.com");
      const formData = new FormData();
      formData.set("sourceUrl", "https://www.linkedin.com/jobs/view/1000000001/");
      const state = await addJobAction(undefined, formData);
      expect(state).toMatchObject({ ok: false, code: "needs_text", fieldErrors: { postingText: "Paste the posting here." } });
      expect(await db.select().from(schema.opportunity)).toHaveLength(0);
    } finally {
      await close();
    }
  });
});

describe("addJobAction server_error", () => {
  it("catches a thrown dependency and returns server_error instead of throwing", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "thrower@example.com");
      harness.throwDeps = true;
      const state = await addJobAction(undefined, addJobForm({}));
      expect(state).toEqual({ ok: false, code: "server_error", message: "Something went wrong. Try again." });
      expect(await db.select().from(schema.opportunity)).toHaveLength(0);
    } finally {
      harness.throwDeps = false;
      await close();
    }
  });
});

function jobWithPosting(posting: string | null): FormData {
  const formData = addJobForm({});
  if (posting !== null) formData.set("postingText", posting);
  return formData;
}

async function onlyOpportunity(db: Db) {
  const [row] = await db.select().from(schema.opportunity);
  return row!;
}

describe("addJobAction fit scoring", () => {
  it("leaves the job pending when the action returns, and done once the after callback has run", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "scorer@example.com");
      await seedProfile(scoped(db, harness.userId));
      harness.ai = createFakeDriver();
      vi.spyOn(console, "info").mockImplementation(() => {});

      const state = await addJobAction(undefined, jobWithPosting("About the job\nWe design internal tools."));
      expect(state).toMatchObject({ ok: true });
      expect(await onlyOpportunity(db)).toMatchObject({ fitStatus: "pending", fitScore: null });
      expect(harness.afterCallbacks).toHaveLength(1);

      await runAfterCallbacks();
      const row = await onlyOpportunity(db);
      expect(row).toMatchObject({ fitStatus: "done", fitScore: 64 });
      expect(parseStoredFit(row.fit)).toMatchObject({ v: 1, score: 64, modelId: "fake-extractor" });
    } finally {
      await close();
    }
  });

  it("scores with the number on the posting's Fit score line", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "scorer@example.com");
      await seedProfile(scoped(db, harness.userId));
      harness.ai = createFakeDriver();
      vi.spyOn(console, "info").mockImplementation(() => {});

      await addJobAction(undefined, jobWithPosting("Fit score: 81\nAbout the job"));
      await runAfterCallbacks();
      expect(await onlyOpportunity(db)).toMatchObject({ fitStatus: "done", fitScore: 81 });
    } finally {
      await close();
    }
  });

  it("ends failed, not pending, when the model fails", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "scorer@example.com");
      await seedProfile(scoped(db, harness.userId));
      harness.ai = createFakeDriver();
      vi.spyOn(console, "info").mockImplementation(() => {});

      await addJobAction(undefined, jobWithPosting("Fit score: fail\nAbout the job"));
      await runAfterCallbacks();
      expect(await onlyOpportunity(db)).toMatchObject({ fitStatus: "failed", fitScore: null });
    } finally {
      await close();
    }
  });

  it("queues nothing when there is no resume", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "scorer@example.com");
      await seedProfile(scoped(db, harness.userId), { resumeMd: null });
      harness.ai = createFakeDriver();

      expect(await addJobAction(undefined, jobWithPosting("About the job"))).toMatchObject({ ok: true });
      expect(harness.afterCallbacks).toHaveLength(0);
      expect(await onlyOpportunity(db)).toMatchObject({ fitStatus: "none" });
    } finally {
      await close();
    }
  });

  it("queues nothing when AI is off", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "scorer@example.com");
      await seedProfile(scoped(db, harness.userId));

      expect(await addJobAction(undefined, jobWithPosting("About the job"))).toMatchObject({ ok: true });
      expect(harness.afterCallbacks).toHaveLength(0);
      expect(await onlyOpportunity(db)).toMatchObject({ fitStatus: "none" });
    } finally {
      await close();
    }
  });

  it("queues nothing for a job added without a posting", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "scorer@example.com");
      await seedProfile(scoped(db, harness.userId));
      harness.ai = createFakeDriver();

      expect(await addJobAction(undefined, jobWithPosting(null))).toMatchObject({ ok: true });
      expect(harness.afterCallbacks).toHaveLength(0);
      expect(await onlyOpportunity(db)).toMatchObject({ fitStatus: "none" });
    } finally {
      await close();
    }
  });

  it("still adds the job, and logs only the error name, when queueing throws", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "scorer@example.com");
      await seedProfile(scoped(db, harness.userId));
      harness.ai = createFakeDriver();
      harness.throwQueue = true;
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(await addJobAction(undefined, jobWithPosting("About the job"))).toMatchObject({ ok: true });
      expect(await db.select().from(schema.opportunity)).toHaveLength(1);
      expect(harness.afterCallbacks).toHaveLength(0);
      expect(error).toHaveBeenCalledTimes(1);
      expect(JSON.parse((error.mock.calls[0] as [string, string])[1])).toEqual({ error: "Error" });
      expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
    } finally {
      await close();
    }
  });

  it("revalidates Home and the board", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "scorer@example.com");
      await addJobAction(undefined, addJobForm({}));
      expect(harness.revalidated).toEqual(expect.arrayContaining(["/", "/board"]));
    } finally {
      await close();
    }
  });
});

describe("board actions and Home", () => {
  it("moveAction revalidates Home along with the board and the job", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signInAs(db, "mover@example.com");
      await addJobAction(undefined, addJobForm({}));
      const row = await onlyOpportunity(db);
      harness.revalidated.length = 0;

      const result = await moveAction(row.id, { kind: "applied" });
      expect(result.ok).toBe(true);
      expect(harness.revalidated).toEqual(expect.arrayContaining(["/", "/board", `/jobs/${row.slug}`]));
    } finally {
      await close();
    }
  });
});
