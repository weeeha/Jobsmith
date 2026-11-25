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
  artifactId: string;
  apiTokenId: string;
  prepQuestionId: string;
  prepMarkId: string;
  prepSessionId: string;
  libraryItemId: string;
  assetId: string;
  ttsSegmentId: string;
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
  const artifact = await s.artifact.insert({
    opportunityId: opportunity.id,
    companyId: null,
    stageId: null,
    key: "cv",
    version: 1,
    kind: "cv",
    title: "CV",
    bodyMd: "# CV",
    contentHash: "seed-hash",
    sourceHash: "seed-hash",
    origin: "pushed",
  });
  const apiToken = await s.apiToken.insert({ name: "Laptop", tokenHash: `seed-hash-${opportunity.id}`, prefix: "jsm_AAAA" });
  await s.prepQuestion.replaceForArtifactKey(opportunity.id, "cv", [
    {
      opportunityId: opportunity.id,
      artifactId: artifact.id,
      artifactVersion: 1,
      artifactKey: "cv",
      number: 1,
      position: 0,
      question: "Tell me about yourself",
      questionKey: "0123456789abcdef",
    },
  ]);
  const [prepQuestion] = await s.prepQuestion.listForJob(opportunity.id);
  const { row: prepMark } = await s.prepMark.applyMark({
    scope: "job",
    opportunityId: opportunity.id,
    questionKey: "0123456789abcdef",
    level: "okay",
    markedAt: new Date("2026-11-01T10:00:00Z"),
    drilled: false,
  });
  const prepSession = await s.prepSession.insert({
    opportunityId: opportunity.id,
    mode: "drill",
    startedAt: new Date("2026-11-01T10:00:00Z"),
  });
  const libraryItem = await s.libraryItem.insert({ kind: "answer", title: "Intro", bodyMd: "Hello" });
  const asset = await s.asset.insert({
    kind: "tts_segment",
    storageKey: `u/seed/tts/${crypto.randomUUID().replace(/-/g, "")}.mp3`,
    contentType: "audio/mpeg",
    bytes: 100,
    sha256: "seed-sha",
  });
  const ttsSegment = await s.ttsSegment.insert({
    hash: `seedhash${opportunity.id.slice(0, 8)}`,
    provider: "fake",
    model: "fake",
    voice: "v",
    style: "v1",
    textChars: 10,
    assetId: asset.id,
    status: "done",
  });
  if (!ttsSegment) throw new Error("seed: tts segment was not inserted");
  return {
    companyId: company.id,
    opportunityId: opportunity.id,
    stageId: stage.id,
    personId: person.id,
    linkId: link.id,
    eventId: event.id,
    artifactId: artifact.id,
    apiTokenId: apiToken.id,
    prepQuestionId: prepQuestion.id,
    prepMarkId: prepMark.id,
    prepSessionId: prepSession.id,
    libraryItemId: libraryItem.id,
    assetId: asset.id,
    ttsSegmentId: ttsSegment.id,
  };
}
