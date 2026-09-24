import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import type { Scoped } from "@/lib/db/scoped";

export async function makeTestDb(): Promise<{ db: Db; client: PGlite; close(): Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../lib/db/migrations"),
  });

  return {
    db,
    client,
    close: () => client.close(),
  };
}

export async function createTestUser(
  db: Db,
  email: string,
): Promise<{ id: string; email: string }> {
  const [row] = await db
    .insert(schema.user)
    .values({ id: crypto.randomUUID(), name: email, email, emailVerified: false })
    .returning({ id: schema.user.id, email: schema.user.email });
  return row;
}

export type SeededIds = {
  companyId: string;
  opportunityId: string;
  stageId: string;
  personId: string;
  linkId: string;
  eventId: string;
};

export async function seedOneOfEach(s: Scoped): Promise<SeededIds> {
  const company = await s.company.insert({ name: "Acme Robotics", nameKey: "acmerobotics" });
  const opportunity = await s.opportunity.insert({
    companyId: company.id,
    slug: `acme-designer-${company.id.slice(0, 8)}`,
    roleTitle: "Product Designer",
  });
  const stage = await s.stage.insert({
    opportunityId: opportunity.id,
    kind: "saved",
    label: "Saved",
    position: 0,
  });
  // Mirrors createOpportunity's own wiring: every real opportunity gets a
  // currentStageId as soon as its first stage
  // exists, so listBoard's join on current_stage_id can find it. Without
  // this, the seeded opportunity would be indistinguishable from one with no
  // stage at all, which is not a state a real opportunity is ever in.
  await s.opportunity.update(opportunity.id, { currentStageId: stage.id });
  const person = await s.person.insert({ companyId: company.id, name: "Priya Raman" });
  const link = await s.opportunityPerson.link({
    opportunityId: opportunity.id,
    personId: person.id,
    role: "recruiter",
  });
  const event = await s.event.insert({ opportunityId: opportunity.id, kind: "created" });
  return {
    companyId: company.id,
    opportunityId: opportunity.id,
    stageId: stage.id,
    personId: person.id,
    linkId: link.id,
    eventId: event.id,
  };
}
