import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity } from "../helpers/opportunity-fixture";
import { addPersonToOpportunity } from "@/lib/people";
import { addNote } from "@/lib/pipeline/notes";
import { getJobView } from "@/lib/pipeline/read";

describe("getJobView", () => {
  it("returns the opportunity, company, stages, current stage, people and events for a slug", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id, slug } = await seedOpportunity(s);
      await addPersonToOpportunity(s, id, { name: "Priya Raman", role: "recruiter" });
      await addNote(s, id, "First note");

      const view = await getJobView(s, slug);

      expect(view?.opportunity.id).toBe(id);
      expect(view?.company.name).toBe("Acme Robotics");
      expect(view?.stages).toHaveLength(7);
      expect(view?.currentStage.kind).toBe("saved");
      expect(view?.people).toHaveLength(1);
      expect(view?.people[0].person.name).toBe("Priya Raman");
      expect(view?.events.length).toBeGreaterThanOrEqual(2);
    } finally {
      await close();
    }
  });

  it("returns null for an unknown slug or a wrong-tenant slug", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { slug } = await seedOpportunity(a);
      expect(await a.opportunity.getBySlug("does-not-exist")).toBeNull();
      expect(await getJobView(b, slug)).toBeNull();
    } finally {
      await close();
    }
  });
});
