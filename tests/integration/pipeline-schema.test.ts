import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, createTestUser } from "../helpers/db";
import * as schema from "@/lib/db/schema";

describe("pipeline schema", () => {
  it("creates all six pipeline tables", async () => {
    const { db, close } = await makeTestDb();
    try {
      await expect(db.select().from(schema.company)).resolves.toEqual([]);
      await expect(db.select().from(schema.opportunity)).resolves.toEqual([]);
      await expect(db.select().from(schema.stage)).resolves.toEqual([]);
      await expect(db.select().from(schema.person)).resolves.toEqual([]);
      await expect(db.select().from(schema.opportunityPerson)).resolves.toEqual([]);
      await expect(db.select().from(schema.event)).resolves.toEqual([]);
    } finally {
      await close();
    }
  });

  it("rejects a stage whose user_id differs from its opportunity's", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const [company] = await db
        .insert(schema.company)
        .values({ userId: alice.id, name: "Acme Robotics", nameKey: "acmerobotics" })
        .returning();
      const [opportunity] = await db
        .insert(schema.opportunity)
        .values({ userId: alice.id, companyId: company.id, slug: "acme-designer", roleTitle: "Designer" })
        .returning();

      await expect(
        db.insert(schema.stage).values({
          userId: bob.id,
          opportunityId: opportunity.id,
          kind: "applied",
          label: "Applied",
          position: 0,
        }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("rejects an opportunity pointing at another user's company", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const bob = await createTestUser(db, "bob2@example.com");
      const [company] = await db
        .insert(schema.company)
        .values({ userId: alice.id, name: "Acme Robotics", nameKey: "acmerobotics" })
        .returning();

      await expect(
        db.insert(schema.opportunity).values({
          userId: bob.id,
          companyId: company.id,
          slug: "acme-designer",
          roleTitle: "Designer",
        }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("rejects a person, opportunity_person, or event whose user_id differs from what it points at", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice5@example.com");
      const bob = await createTestUser(db, "bob3@example.com");
      const [aliceCompany] = await db
        .insert(schema.company)
        .values({ userId: alice.id, name: "Acme Robotics", nameKey: "acmerobotics" })
        .returning();
      const [aliceOpportunity] = await db
        .insert(schema.opportunity)
        .values({ userId: alice.id, companyId: aliceCompany.id, slug: "acme-designer", roleTitle: "Designer" })
        .returning();
      const [alicePerson] = await db
        .insert(schema.person)
        .values({ userId: alice.id, companyId: aliceCompany.id, name: "Priya Raman" })
        .returning();
      const [bobCompany] = await db
        .insert(schema.company)
        .values({ userId: bob.id, name: "Northwind Labs", nameKey: "northwindlabs" })
        .returning();
      const [bobOpportunity] = await db
        .insert(schema.opportunity)
        .values({ userId: bob.id, companyId: bobCompany.id, slug: "northwind-designer", roleTitle: "Designer" })
        .returning();
      const [bobPerson] = await db
        .insert(schema.person)
        .values({ userId: bob.id, companyId: bobCompany.id, name: "Sam Okafor" })
        .returning();

      // person.user_id must agree with the company it points at.
      await expect(
        db.insert(schema.person).values({ userId: bob.id, companyId: aliceCompany.id, name: "Hacked" }),
      ).rejects.toThrow();

      // opportunity_person.user_id must agree with the opportunity it points at.
      await expect(
        db.insert(schema.opportunityPerson).values({
          userId: bob.id,
          opportunityId: aliceOpportunity.id,
          personId: bobPerson.id,
          role: "recruiter",
        }),
      ).rejects.toThrow();

      // opportunity_person.user_id must also agree with the person it points at.
      await expect(
        db.insert(schema.opportunityPerson).values({
          userId: bob.id,
          opportunityId: bobOpportunity.id,
          personId: alicePerson.id,
          role: "recruiter",
        }),
      ).rejects.toThrow();

      // event.user_id must agree with the opportunity it points at.
      await expect(
        db.insert(schema.event).values({ userId: bob.id, opportunityId: aliceOpportunity.id, kind: "created" }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("rejects a bad value for every enum and range CHECK", async () => {
    const { db, client, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice3@example.com");
      const [company] = await db
        .insert(schema.company)
        .values({ userId: alice.id, name: "Acme Robotics", nameKey: "acmerobotics" })
        .returning();
      const [opportunity] = await db
        .insert(schema.opportunity)
        .values({ userId: alice.id, companyId: company.id, slug: "acme-designer", roleTitle: "Designer" })
        .returning();
      const [stageRow] = await db
        .insert(schema.stage)
        .values({ userId: alice.id, opportunityId: opportunity.id, kind: "saved", label: "Saved", position: 0 })
        .returning();
      const [person] = await db
        .insert(schema.person)
        .values({ userId: alice.id, companyId: company.id, name: "Priya Raman" })
        .returning();
      const [link] = await db
        .insert(schema.opportunityPerson)
        .values({ userId: alice.id, opportunityId: opportunity.id, personId: person.id, role: "recruiter" })
        .returning();
      const [eventRow] = await db
        .insert(schema.event)
        .values({ userId: alice.id, opportunityId: opportunity.id, kind: "created" })
        .returning();

      const cases: { name: string; sql: string; params: unknown[] }[] = [
        { name: "company.ats_kind", sql: `update company set ats_kind = 'bogus' where id = $1`, params: [company.id] },
        { name: "opportunity.work_mode", sql: `update opportunity set work_mode = 'bogus' where id = $1`, params: [opportunity.id] },
        { name: "opportunity.source", sql: `update opportunity set source = 'bogus' where id = $1`, params: [opportunity.id] },
        { name: "opportunity.fit_status", sql: `update opportunity set fit_status = 'bogus' where id = $1`, params: [opportunity.id] },
        { name: "opportunity.status", sql: `update opportunity set status = 'bogus' where id = $1`, params: [opportunity.id] },
        { name: "opportunity.closed_reason", sql: `update opportunity set closed_reason = 'bogus' where id = $1`, params: [opportunity.id] },
        { name: "opportunity.fit_score too high", sql: `update opportunity set fit_score = 101 where id = $1`, params: [opportunity.id] },
        { name: "opportunity.fit_score negative", sql: `update opportunity set fit_score = -1 where id = $1`, params: [opportunity.id] },
        { name: "opportunity closed with no reason or closed_at", sql: `update opportunity set status = 'closed' where id = $1`, params: [opportunity.id] },
        { name: "stage.kind", sql: `update stage set kind = 'bogus' where id = $1`, params: [stageRow.id] },
        { name: "stage.status", sql: `update stage set status = 'bogus' where id = $1`, params: [stageRow.id] },
        { name: "stage.format", sql: `update stage set format = 'bogus' where id = $1`, params: [stageRow.id] },
        { name: "opportunity_person.role", sql: `update opportunity_person set role = 'bogus' where id = $1`, params: [link.id] },
        { name: "event.kind", sql: `update event set kind = 'bogus' where id = $1`, params: [eventRow.id] },
      ];

      for (const c of cases) {
        await expect(client.query(c.sql, c.params)).rejects.toThrow();
      }

      // The rejected "closed with no reason" case above must not have
      // committed; confirm the opportunity is still active and can be
      // closed correctly, and that reopening it inconsistently is rejected.
      await client.query(
        `update opportunity set status = 'closed', closed_reason = 'withdrawn', closed_at = now(), closed_stage_id = $2 where id = $1`,
        [opportunity.id, stageRow.id],
      );
      await expect(
        client.query(`update opportunity set status = 'active' where id = $1`, [opportunity.id]),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("cascades a user delete through all six pipeline tables", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice4@example.com");
      const [company] = await db
        .insert(schema.company)
        .values({ userId: alice.id, name: "Acme Robotics", nameKey: "acmerobotics" })
        .returning();
      const [opportunity] = await db
        .insert(schema.opportunity)
        .values({ userId: alice.id, companyId: company.id, slug: "acme-designer", roleTitle: "Designer" })
        .returning();
      const [stageRow] = await db
        .insert(schema.stage)
        .values({ userId: alice.id, opportunityId: opportunity.id, kind: "saved", label: "Saved", position: 0 })
        .returning();
      const [person] = await db
        .insert(schema.person)
        .values({ userId: alice.id, companyId: company.id, name: "Priya Raman" })
        .returning();
      await db
        .insert(schema.opportunityPerson)
        .values({ userId: alice.id, opportunityId: opportunity.id, personId: person.id, role: "recruiter" });
      await db.insert(schema.event).values({ userId: alice.id, opportunityId: opportunity.id, kind: "created" });
      void stageRow;

      await db.delete(schema.user).where(eq(schema.user.id, alice.id));

      await expect(db.select().from(schema.company)).resolves.toEqual([]);
      await expect(db.select().from(schema.opportunity)).resolves.toEqual([]);
      await expect(db.select().from(schema.stage)).resolves.toEqual([]);
      await expect(db.select().from(schema.person)).resolves.toEqual([]);
      await expect(db.select().from(schema.opportunityPerson)).resolves.toEqual([]);
      await expect(db.select().from(schema.event)).resolves.toEqual([]);
    } finally {
      await close();
    }
  });
});
