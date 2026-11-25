import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import * as schema from "@/lib/db/schema";

type Seed = Awaited<ReturnType<typeof seed>>;

async function seed() {
  const t = await makeTestDb();
  const user = await createTestUser(t.db, "prep-schema@example.com");
  const [company] = await t.db
    .insert(schema.company)
    .values({ userId: user.id, name: "Northwind Traders", nameKey: "northwindtraders" })
    .returning();
  const [opp] = await t.db
    .insert(schema.opportunity)
    .values({ userId: user.id, companyId: company.id, slug: "nwt-designer", roleTitle: "Designer" })
    .returning();
  const [opp2] = await t.db
    .insert(schema.opportunity)
    .values({ userId: user.id, companyId: company.id, slug: "nwt-designer-2", roleTitle: "Designer 2" })
    .returning();
  const [art] = await t.db
    .insert(schema.artifact)
    .values({
      userId: user.id,
      opportunityId: opp.id,
      key: "answers-full",
      version: 1,
      kind: "question_bank",
      title: "Answers",
      bodyMd: "# x",
      contentHash: "h",
      origin: "pushed",
    })
    .returning();
  return { ...t, user, opp, opp2, art };
}

async function insertQuestion(s: Seed, position: number) {
  return s.db
    .insert(schema.prepQuestion)
    .values({
      userId: s.user.id,
      opportunityId: s.opp.id,
      artifactId: s.art.id,
      artifactVersion: 1,
      artifactKey: "answers-full",
      number: position + 1,
      position,
      question: "Tell me about yourself",
      questionKey: "0123456789abcdef",
    })
    .returning();
}

function markSql(userId: string, scope: string, oppId: string | null, key: string, level = "solid") {
  return {
    text: `insert into prep_mark (user_id, scope, opportunity_id, question_key, level, marked_at) values ($1, $2, $3, $4, $5, now())`,
    params: [userId, scope, oppId, key, level],
  };
}

describe("prep schema", () => {
  it("creates the six tables and the profile.prep column", async () => {
    const { client, close } = await makeTestDb();
    try {
      const tables = await client.query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'public'
         and table_name in ('prep_question','prep_mark','prep_session','library_item','asset','tts_segment')`,
      );
      expect(tables.rows.map((r) => r.table_name).sort()).toEqual(
        ["asset", "library_item", "prep_mark", "prep_question", "prep_session", "tts_segment"],
      );
      const col = await client.query<{ data_type: string; is_nullable: string }>(
        `select data_type, is_nullable from information_schema.columns
         where table_name = 'profile' and column_name = 'prep'`,
      );
      expect(col.rows).toEqual([{ data_type: "jsonb", is_nullable: "NO" }]);
    } finally {
      await close();
    }
  });

  it("profile.prep defaults to an empty object", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "prep-default@example.com");
      const [row] = await db.insert(schema.profile).values({ userId: user.id }).returning();
      expect(row.prep).toEqual({});
    } finally {
      await close();
    }
  });

  it("prep_mark rejects an unknown level and an unknown scope", async () => {
    const s = await seed();
    try {
      const bad1 = markSql(s.user.id, "job", s.opp.id, "aaaaaaaaaaaaaaaa", "great");
      await expect(s.client.query(bad1.text, bad1.params)).rejects.toThrow();
      const bad2 = markSql(s.user.id, "team", s.opp.id, "aaaaaaaaaaaaaaaa");
      await expect(s.client.query(bad2.text, bad2.params)).rejects.toThrow();
    } finally {
      await s.close();
    }
  });

  it("prep_mark is unique per scope, job and question key and treats a null job as one value", async () => {
    const s = await seed();
    try {
      const lib1 = markSql(s.user.id, "library", null, "bbbbbbbbbbbbbbbb");
      await s.client.query(lib1.text, lib1.params);
      await expect(s.client.query(lib1.text, lib1.params)).rejects.toMatchObject({ code: "23505" });

      const j1 = markSql(s.user.id, "job", s.opp.id, "cccccccccccccccc");
      const j2 = markSql(s.user.id, "job", s.opp2.id, "cccccccccccccccc");
      await s.client.query(j1.text, j1.params);
      await s.client.query(j2.text, j2.params);
      await expect(s.client.query(j1.text, j1.params)).rejects.toMatchObject({ code: "23505" });
    } finally {
      await s.close();
    }
  });

  it("prep_question is unique on artifact_id and position", async () => {
    const s = await seed();
    try {
      await insertQuestion(s, 0);
      await insertQuestion(s, 1);
      await expect(insertQuestion(s, 0)).rejects.toThrow();
    } finally {
      await s.close();
    }
  });

  it("deleting an artifact deletes its prep_question rows", async () => {
    const s = await seed();
    try {
      await insertQuestion(s, 0);
      await s.client.query(`delete from artifact where id = $1`, [s.art.id]);
      expect(await s.db.select().from(schema.prepQuestion)).toEqual([]);
    } finally {
      await s.close();
    }
  });

  it("deleting an opportunity deletes its prep_question, job prep_mark and prep_session rows and keeps library_item with a null source", async () => {
    const s = await seed();
    try {
      await insertQuestion(s, 0);
      const jm = markSql(s.user.id, "job", s.opp.id, "dddddddddddddddd");
      await s.client.query(jm.text, jm.params);
      const lm = markSql(s.user.id, "library", null, "dddddddddddddddd");
      await s.client.query(lm.text, lm.params);
      await s.db.insert(schema.prepSession).values({
        userId: s.user.id,
        opportunityId: s.opp.id,
        mode: "drill",
        startedAt: new Date(),
      });
      await s.db.insert(schema.libraryItem).values({
        userId: s.user.id,
        kind: "answer",
        title: "Intro",
        bodyMd: "Hello",
        sourceOpportunityId: s.opp.id,
        sourceArtifactId: s.art.id,
      });

      await s.client.query(`delete from opportunity where id = $1`, [s.opp.id]);

      expect(await s.db.select().from(schema.prepQuestion)).toEqual([]);
      expect(await s.db.select().from(schema.prepSession)).toEqual([]);
      const marks = await s.db.select().from(schema.prepMark);
      expect(marks.map((m) => m.scope)).toEqual(["library"]);
      const items = await s.db.select().from(schema.libraryItem);
      expect(items).toHaveLength(1);
      expect(items[0].sourceOpportunityId).toBeNull();
      expect(items[0].sourceArtifactId).toBeNull();
    } finally {
      await s.close();
    }
  });

  it("tts_segment is unique per user and hash, and deleting its asset deletes the segment", async () => {
    const s = await seed();
    try {
      const [asset] = await s.db
        .insert(schema.asset)
        .values({
          userId: s.user.id,
          kind: "tts_segment",
          storageKey: "u/x/tts/1.mp3",
          contentType: "audio/mpeg",
          bytes: 10,
          sha256: "s",
        })
        .returning();
      const values = {
        userId: s.user.id,
        hash: "abcdabcdabcdabcd",
        provider: "fake",
        model: "m",
        voice: "v",
        style: "v1",
        textChars: 5,
        assetId: asset.id,
        status: "done" as const,
      };
      await s.db.insert(schema.ttsSegment).values(values);
      await expect(s.db.insert(schema.ttsSegment).values(values)).rejects.toThrow();
      await s.client.query(`delete from asset where id = $1`, [asset.id]);
      expect(await s.db.select().from(schema.ttsSegment)).toEqual([]);
    } finally {
      await s.close();
    }
  });

  it("asset.storage_key is unique", async () => {
    const s = await seed();
    try {
      const values = {
        userId: s.user.id,
        kind: "other" as const,
        storageKey: "u/x/other/1.bin",
        contentType: "application/octet-stream",
        bytes: 1,
        sha256: "s",
      };
      await s.db.insert(schema.asset).values(values);
      await expect(s.db.insert(schema.asset).values(values)).rejects.toThrow();
    } finally {
      await s.close();
    }
  });

  it("event accepts prep_drilled and rejects an unknown kind", async () => {
    const s = await seed();
    try {
      await s.db.insert(schema.event).values({
        userId: s.user.id,
        opportunityId: s.opp.id,
        kind: "prep_drilled",
        body: "Drilled 10 questions, 4 marked solid",
      });
      await expect(
        s.client.query(
          `insert into event (user_id, opportunity_id, kind) values ($1, $2, 'bogus')`,
          [s.user.id, s.opp.id],
        ),
      ).rejects.toThrow();
    } finally {
      await s.close();
    }
  });
});
