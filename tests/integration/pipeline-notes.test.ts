import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import { addNote } from "@/lib/pipeline/notes";
import { expectOk, expectFail } from "../helpers/result";

describe("addNote", () => {
  it("writes one note event and returns its id", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const before = await s.event.listForOpportunity(id);

      const result = expectOk(await addNote(s, id, "Recruiter called, moving to onsite next week.", FIXTURE_NOW));

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].id).toBe(result.eventId);
      expect(after[0].kind).toBe("note");
      expect(after[0].body).toBe("Recruiter called, moving to onsite next week.");
    } finally {
      await close();
    }
  });

  it("rejects a blank note and an unknown or wrong-tenant opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await addNote(a, id, "   ", FIXTURE_NOW), "invalid");
      expectFail(await addNote(b, id, "Hi", FIXTURE_NOW), "not_found");
    } finally {
      await close();
    }
  });
});
