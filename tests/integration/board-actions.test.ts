import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { addJobAction } from "@/app/(app)/board/actions";
import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { fakeGuardedFetch } from "../helpers/intake";

// addJobAction turns the Add job form's text into numbers before
// addJobFormSchema sees it, so addJob's own tests cannot catch a bad
// conversion here: by then every pay figure is already a number or
// undefined. These tests call the action itself. The signed-in user and
// path revalidation need a live Next.js request, so both are stubbed;
// scopedFor is pointed at a real PGlite database through the real scoped();
// intakeDeps is stubbed so no test ever touches the network or a real model.
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "", throwDeps: false }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

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
