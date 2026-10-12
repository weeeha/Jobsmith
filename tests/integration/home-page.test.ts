import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { setNextAction } from "@/lib/pipeline/next-action";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import HomePage from "@/app/(app)/page";
import { makeTestDb, createTestUser } from "../helpers/db";
import { seedOpportunity } from "../helpers/opportunity-fixture";

// The page is an async server component, so the test awaits it and renders the
// element it returns to markup. requireUser and scopedFor are stubbed the same
// way the action tests do it; the database is a real PGlite.
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));

vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: harness.userId }) }));
vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});
// The page imports the client list, which imports the server actions file, and
// that file imports the auth instance (it reads the server environment).
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: async () => {} } } }));

async function renderHome(): Promise<string> {
  const page = await HomePage();
  return renderToStaticMarkup(createElement(LiveAnnouncerProvider, null, page));
}

describe("Home page", () => {
  it("shows the no-jobs empty state and the summary column for a new account", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "home-empty@example.com")).id;
      const html = await renderHome();
      expect(html).toContain("<h1");
      expect(html).toContain("No jobs yet.");
      expect(html).toContain("Go to the board");
      expect(html).toContain("No pushes yet.");
      expect(html).not.toContain("Things to do today");
    } finally {
      await close();
    }
  });

  it("lists a due next action under Today and the columns under Pipeline", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "home-due@example.com")).id;
      const s = scoped(db, harness.userId);
      const { id } = await seedOpportunity(s);
      await setNextAction(s, id, { text: "Send portfolio", at: new Date("2020-01-01T09:00:00.000Z") });
      const html = await renderHome();
      expect(html).toContain('aria-label="Things to do today"');
      expect(html).toContain("Product Designer at Acme Robotics");
      expect(html).toContain("Send portfolio. Overdue since");
      expect(html).toContain("Snooze");
      for (const label of ["Saved", "Applied", "Offer"]) expect(html).toContain(label);
      expect(html).not.toContain("Nothing needs attention today.");
    } finally {
      await close();
    }
  });

  it("says nothing needs attention when there are jobs and no items", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "home-quiet@example.com")).id;
      await seedOpportunity(scoped(db, harness.userId), {}, new Date());
      const html = await renderHome();
      expect(html).toContain("Nothing needs attention today.");
      expect(html).not.toContain("No jobs yet.");
    } finally {
      await close();
    }
  });
});
