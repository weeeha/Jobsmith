# Milestone 2 (Pipeline): Tasks 1 to 5

Part of the Milestone 2 plan. Read [README.md](README.md) first: it holds the goal, the global constraints and the Contract (called "the frame" in the task text) that these tasks follow. These tasks cover the schema and migration, the scoped helpers, the pure pipeline rules, persistence, and everyday job data.


### Task 1: Schema and migration

**Files:**
- Create: `lib/db/schema/pipeline.ts`, `lib/pipeline/values.ts`, `tests/integration/pipeline-schema.test.ts`
- Modify: `lib/db/schema/index.ts`
- Generated (by a command, not by hand): `lib/db/migrations/0002_*.sql`, `lib/db/migrations/meta/0002_snapshot.json`, `lib/db/migrations/meta/_journal.json`

**Interfaces:**
- Consumes: `user` table from `lib/db/schema/auth.ts` (Milestone 1). `STAGE_KINDS`, `StageKind` from `lib/pipeline/kinds.ts` (Milestone 1). `makeTestDb`, `createTestUser` from `tests/helpers/db.ts` (Milestone 1).
- Produces: Drizzle tables `company`, `opportunity`, `stage`, `person`, `opportunityPerson`, `event` from `lib/db/schema/pipeline.ts`, re-exported from `lib/db/schema/index.ts`. Each table's `$inferSelect` and `$inferInsert` are what Task 2 builds its `XRow` and `XFields` types from. From `lib/pipeline/values.ts`: the value-list consts `STAGE_STATUSES`, `STAGE_FORMATS`, `WORK_MODES`, `OPPORTUNITY_SOURCES`, `OPPORTUNITY_STATUSES`, `CLOSED_REASONS`, `FIT_STATUSES`, `ATS_KINDS`, `PERSON_ROLES`, `EVENT_KINDS`, `STAGE_KIND_VALUES`, and their derived types `StageStatus`, `StageFormat`, `WorkMode`, `OpportunitySource`, `OpportunityStatus`, `ClosedReason`, `FitStatus`, `AtsKind`, `PersonRole`, `EventKind`.

The frame's `lib/pipeline/values.ts` snippet writes `STAGE_KIND_VALUES` as a plain `STAGE_KINDS.map((s) => s.kind)` with a comment saying it is "typed as a tuple". `Array.prototype.map`'s library signature returns `U[]`, not a tuple, and Drizzle's `text(name, { enum })` requires a non-empty tuple (`Readonly<[U, ...U[]]>`). Verified in a planning scratch file (`values-spike.ts`, not kept in the repo): the plain `.map()` result fails to type-check against `text()`'s enum config (confirmed the exact compiler error in a throwaway negative check), and asserting it as `[StageKind, ...StageKind[]]` fixes this with no change to the runtime values. The step below uses the asserted form. Every other value list in this file is already a literal `as const` array, a tuple by construction, and needs no assertion.

- [ ] **Step 1: Write the value lists**

Create `lib/pipeline/values.ts`:

```typescript
import { STAGE_KINDS, type StageKind } from "./kinds";

export const STAGE_STATUSES = ["upcoming", "scheduled", "done", "skipped"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const STAGE_FORMATS = ["phone", "video", "onsite", "async"] as const;
export type StageFormat = (typeof STAGE_FORMATS)[number];

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const OPPORTUNITY_SOURCES = ["url", "text", "manual", "feed"] as const;
export type OpportunitySource = (typeof OPPORTUNITY_SOURCES)[number];

export const OPPORTUNITY_STATUSES = ["active", "closed"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const CLOSED_REASONS = ["rejected", "withdrawn", "ghosted", "declined", "accepted"] as const;
export type ClosedReason = (typeof CLOSED_REASONS)[number];

export const FIT_STATUSES = ["none", "pending", "done", "failed"] as const;
export type FitStatus = (typeof FIT_STATUSES)[number];

export const ATS_KINDS = ["greenhouse", "ashby", "lever", "other"] as const;
export type AtsKind = (typeof ATS_KINDS)[number];

export const PERSON_ROLES = ["recruiter", "hiring_manager", "interviewer", "referrer", "other"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export const EVENT_KINDS = [
  "created",
  "stage_moved",
  "closed",
  "reopened",
  "note",
  "interview_scheduled",
  "document_sent",
  "artifact_pushed",
  "next_action_done",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

// STAGE_KINDS.map() returns StageKind[] (Array#map's library signature is
// not tuple-preserving), but Drizzle's text(name, { enum }) requires a
// non-empty tuple. Every list above is already a literal `as const` array, a
// tuple by construction, and needs no assertion; this is the only list
// derived through a method call, so it is the only one that needs one.
export const STAGE_KIND_VALUES = STAGE_KINDS.map((s) => s.kind) as [StageKind, ...StageKind[]];
```

- [ ] **Step 2: Write the pipeline schema**

Create `lib/db/schema/pipeline.ts`:

```typescript
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamp,
  jsonb,
  foreignKey,
  unique,
  check,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import {
  STAGE_KIND_VALUES,
  STAGE_STATUSES,
  STAGE_FORMATS,
  WORK_MODES,
  OPPORTUNITY_SOURCES,
  OPPORTUNITY_STATUSES,
  CLOSED_REASONS,
  FIT_STATUSES,
  ATS_KINDS,
  PERSON_ROLES,
  EVENT_KINDS,
} from "@/lib/pipeline/values";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const company = pgTable(
  "company",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    domain: text("domain"),
    careersUrl: text("careers_url"),
    atsKind: text("ats_kind", { enum: ATS_KINDS }),
    atsOrg: text("ats_org"),
    size: text("size"),
    industry: text("industry"),
    hq: text("hq"),
    notesMd: text("notes_md"),
    tracked: boolean("tracked").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique("company_user_id_id_unique").on(t.userId, t.id),
    unique("company_user_name_key_unique").on(t.userId, t.nameKey),
    check("company_ats_kind_check", sql`${t.atsKind} in ('greenhouse', 'ashby', 'lever', 'other')`),
  ],
);

export const opportunity = pgTable(
  "opportunity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull(),
    slug: text("slug").notNull(),
    roleTitle: text("role_title").notNull(),
    location: text("location"),
    workMode: text("work_mode", { enum: WORK_MODES }),
    source: text("source", { enum: OPPORTUNITY_SOURCES }).notNull().default("manual"),
    sourceUrl: text("source_url"),
    postingMd: text("posting_md"),
    postingCapturedAt: timestamp("posting_captured_at", { withTimezone: true }),
    compMin: integer("comp_min"),
    compMax: integer("comp_max"),
    compCurrency: text("comp_currency"),
    compNote: text("comp_note"),
    myAsk: text("my_ask"),
    fitScore: integer("fit_score"),
    fit: jsonb("fit"),
    fitStatus: text("fit_status", { enum: FIT_STATUSES }).notNull().default("none"),
    needsReview: boolean("needs_review").notNull().default(false),
    // Circular pointer (D2): stage is declared after opportunity, so this
    // forward reference is boxed as AnyPgColumn to keep TypeScript from
    // needing stage's own type while it is still being defined. NO ACTION
    // is Drizzle's default when no onDelete is given.
    currentStageId: uuid("current_stage_id").references((): AnyPgColumn => stage.id),
    status: text("status", { enum: OPPORTUNITY_STATUSES }).notNull().default("active"),
    closedReason: text("closed_reason", { enum: CLOSED_REASONS }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedStageId: uuid("closed_stage_id").references((): AnyPgColumn => stage.id),
    nextAction: text("next_action"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    dedupeHash: text("dedupe_hash"),
    ...timestamps,
  },
  (t) => [
    unique("opportunity_user_id_id_unique").on(t.userId, t.id),
    unique("opportunity_user_slug_unique").on(t.userId, t.slug),
    index("opportunity_user_status_idx").on(t.userId, t.status),
    index("opportunity_company_idx").on(t.companyId),
    foreignKey({
      name: "opportunity_company_fk",
      columns: [t.userId, t.companyId],
      foreignColumns: [company.userId, company.id],
    }),
    check("opportunity_work_mode_check", sql`${t.workMode} in ('remote', 'hybrid', 'onsite')`),
    check("opportunity_source_check", sql`${t.source} in ('url', 'text', 'manual', 'feed')`),
    check("opportunity_fit_status_check", sql`${t.fitStatus} in ('none', 'pending', 'done', 'failed')`),
    check("opportunity_status_check", sql`${t.status} in ('active', 'closed')`),
    check(
      "opportunity_closed_reason_check",
      sql`${t.closedReason} in ('rejected', 'withdrawn', 'ghosted', 'declined', 'accepted')`,
    ),
    check(
      "opportunity_fit_score_check",
      sql`${t.fitScore} is null or (${t.fitScore} >= 0 and ${t.fitScore} <= 100)`,
    ),
    check(
      "opportunity_closed_consistency",
      sql`(${t.status} = 'closed') = (${t.closedReason} is not null and ${t.closedAt} is not null)`,
    ),
  ],
);

export const stage = pgTable(
  "stage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").notNull(),
    kind: text("kind", { enum: STAGE_KIND_VALUES }).notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    status: text("status", { enum: STAGE_STATUSES }).notNull().default("upcoming"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    format: text("format", { enum: STAGE_FORMATS }),
    enteredAt: timestamp("entered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    outcomeMd: text("outcome_md"),
    ...timestamps,
  },
  (t) => [
    unique("stage_user_id_id_unique").on(t.userId, t.id),
    unique("stage_opportunity_position_unique").on(t.opportunityId, t.position),
    foreignKey({
      name: "stage_opportunity_fk",
      columns: [t.userId, t.opportunityId],
      foreignColumns: [opportunity.userId, opportunity.id],
    }).onDelete("cascade"),
    check(
      "stage_kind_check",
      sql`${t.kind} in ('saved', 'applied', 'recruiter_screen', 'hiring_manager', 'portfolio_case', 'panel_final', 'offer')`,
    ),
    check("stage_status_check", sql`${t.status} in ('upcoming', 'scheduled', 'done', 'skipped')`),
    check("stage_format_check", sql`${t.format} in ('phone', 'video', 'onsite', 'async')`),
  ],
);

export const person = pgTable(
  "person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull(),
    name: text("name").notNull(),
    title: text("title"),
    linkedinUrl: text("linkedin_url"),
    email: text("email"),
    notesMd: text("notes_md"),
    ...timestamps,
  },
  (t) => [
    unique("person_user_id_id_unique").on(t.userId, t.id),
    foreignKey({
      name: "person_company_fk",
      columns: [t.userId, t.companyId],
      foreignColumns: [company.userId, company.id],
    }).onDelete("cascade"),
  ],
);

export const opportunityPerson = pgTable(
  "opportunity_person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").notNull(),
    personId: uuid("person_id").notNull(),
    role: text("role", { enum: PERSON_ROLES }).notNull().default("other"),
    stageId: uuid("stage_id").references(() => stage.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("opportunity_person_opportunity_person_unique").on(t.opportunityId, t.personId),
    foreignKey({
      name: "opportunity_person_opportunity_fk",
      columns: [t.userId, t.opportunityId],
      foreignColumns: [opportunity.userId, opportunity.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "opportunity_person_person_fk",
      columns: [t.userId, t.personId],
      foreignColumns: [person.userId, person.id],
    }).onDelete("cascade"),
    check(
      "opportunity_person_role_check",
      sql`${t.role} in ('recruiter', 'hiring_manager', 'interviewer', 'referrer', 'other')`,
    ),
  ],
);

export const event = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").notNull(),
    stageId: uuid("stage_id").references(() => stage.id, { onDelete: "set null" }),
    kind: text("kind", { enum: EVENT_KINDS }).notNull(),
    body: text("body"),
    meta: jsonb("meta").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [
    index("event_opportunity_occurred_idx").on(t.opportunityId, t.occurredAt),
    foreignKey({
      name: "event_opportunity_fk",
      columns: [t.userId, t.opportunityId],
      foreignColumns: [opportunity.userId, opportunity.id],
    }).onDelete("cascade"),
    check(
      "event_kind_check",
      sql`${t.kind} in ('created', 'stage_moved', 'closed', 'reopened', 'note', 'interview_scheduled', 'document_sent', 'artifact_pushed', 'next_action_done')`,
    ),
  ],
);
```

Verified in a planning scratch file (`pipeline-schema-full-spike.ts`, not kept in the repo) (type-checks under strict TypeScript, including the `@ts-expect-error` proving `stage.kind` narrows to `StageKind` and not `string`) and in a planning scratch file (`check-full.mjs`, not kept in the repo) (runs the generated SQL against PGlite: every cross-tenant composite-FK insert is rejected, every CHECK constraint rejects its bad value and accepts its boundary-valid value, `opportunity_closed_consistency` rejects a `closed` row with no reason and rejects clearing `status` back to `active` while a reason is still set, and deleting the user cascades to zero rows in all six tables).

- [ ] **Step 3: Re-export the pipeline schema**

Edit `lib/db/schema/index.ts` to read:

```typescript
export * from "./auth";
export * from "./app";
export * from "./pipeline";
```

- [ ] **Step 4: Generate the migration**

```bash
pnpm db:generate
```

Expected output: drizzle-kit's summary lists every table currently in the schema, not only the new ones, so ignore the count and compare the generated SQL file with the bullets below. It also prints a line `Your SQL migration file ➜ lib/db/migrations/0002_<name>.sql`.

The builder does not hand-write this file. Open the generated `lib/db/migrations/0002_<name>.sql` and confirm it contains, reading top to bottom (drizzle-kit lists new tables alphabetically, not in source declaration order):

- Six `CREATE TABLE` statements: `company`, `event`, `opportunity`, `opportunity_person`, `person`, `stage`.
- On `company`: `CONSTRAINT company_user_id_id_unique UNIQUE(user_id,id)`, `CONSTRAINT company_user_name_key_unique UNIQUE(user_id,name_key)`, `CONSTRAINT company_ats_kind_check CHECK (...)`.
- On `opportunity`: `UNIQUE(user_id,id)`, `UNIQUE(user_id,slug)`, and CHECK constraints named `opportunity_work_mode_check`, `opportunity_source_check`, `opportunity_fit_status_check`, `opportunity_status_check`, `opportunity_closed_reason_check`, `opportunity_fit_score_check`, `opportunity_closed_consistency`.
- On `stage`: `UNIQUE(user_id,id)`, `UNIQUE(opportunity_id,position)`, CHECK constraints `stage_kind_check`, `stage_status_check`, `stage_format_check`.
- On `person`: `UNIQUE(user_id,id)`.
- On `opportunity_person`: `UNIQUE(opportunity_id,person_id)`, CHECK `opportunity_person_role_check`.
- A block of `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` statements, each on its own line, including: every table's own `user_id` reference to `user(id)` with `ON DELETE cascade`; `opportunity_current_stage_id_stage_id_fk` and `opportunity_closed_stage_id_stage_id_fk`, both `ON DELETE no action`; the composite `opportunity_company_fk` on `(user_id, company_id)` referencing `company(user_id, id)`, `ON DELETE no action`; the composite `stage_opportunity_fk` on `(user_id, opportunity_id)` referencing `opportunity(user_id, id)`, `ON DELETE cascade`; the composite `person_company_fk`, `ON DELETE cascade`; the two composite foreign keys on `opportunity_person` (`opportunity_person_opportunity_fk`, `opportunity_person_person_fk`), both `ON DELETE cascade`; the single-column `opportunity_person_stage_id_stage_id_fk` and `event_stage_id_stage_id_fk`, both `ON DELETE set null`; the composite `event_opportunity_fk`, `ON DELETE cascade`.
- Every foreign key is its own `ALTER TABLE` statement, never inlined in a `CREATE TABLE`. This is what makes the `opportunity`/`stage` circular pair possible: each table is created first with no forward-referencing constraint, and the constraints are added afterward once both tables exist.
- Two indexes on `opportunity` (`opportunity_user_status_idx`, `opportunity_company_idx`) and one each on `stage`... no, on `event` (`event_opportunity_occurred_idx`); `stage` itself has no plain index beyond its unique constraints.

If any of this is missing or different, the schema in Step 2 has a mistake; fix the schema, delete the generated migration folder for `0002_*`, and re-run `pnpm db:generate` rather than hand-editing the generated SQL.

- [ ] **Step 5: Write the failing schema tests**

Create `tests/integration/pipeline-schema.test.ts`:

```typescript
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
```

- [ ] **Step 6: Run the new tests and confirm they fail**

```bash
pnpm exec vitest run tests/integration/pipeline-schema.test.ts
```

Expected: fails, because `lib/db/schema/pipeline.ts` does not exist yet if Step 2 has not landed, or (if you are re-running after a schema mistake) one of the six tests fails with a constraint that does not behave as listed above.

- [ ] **Step 7: Run the new tests and confirm they pass**

```bash
pnpm exec vitest run tests/integration/pipeline-schema.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 8: Confirm the existing migration test still passes**

`tests/integration/migrations.test.ts` already has a test that queries `information_schema.columns` for any column of type `timestamp without time zone` across the whole database, so it automatically covers the six new tables without changes.

```bash
pnpm exec vitest run tests/integration/migrations.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 3 passed (3)`.

- [ ] **Step 9: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0, with `pnpm test` reporting every existing test still passing alongside the new ones.

- [ ] **Step 10: Commit**

```bash
git add lib/db/schema/pipeline.ts lib/db/schema/index.ts lib/pipeline/values.ts lib/db/migrations tests/integration/pipeline-schema.test.ts
git commit -m "$(cat <<'EOF'
feat: add the pipeline schema, migration and shared value lists

EOF
)"
```

---

### Task 2: Scoped helpers per table, transaction, isolation matrix

**Files:**
- Create: `lib/db/scoped/index.ts`, `lib/db/scoped/strip.ts`, `lib/db/scoped/profile.ts`, `lib/db/scoped/company.ts`, `lib/db/scoped/opportunity.ts`, `lib/db/scoped/stage.ts`, `lib/db/scoped/person.ts`, `lib/db/scoped/opportunity-person.ts`, `lib/db/scoped/event.ts`
- Delete: `lib/db/scoped.ts` (replaced by the folder above; the import path `@/lib/db/scoped` keeps working because it now resolves to `lib/db/scoped/index.ts`)
- Modify: none (the ESLint rule already covers `**/db/client`, which still matches; no change needed there)
- Test: `tests/integration/scoped-isolation.test.ts`
- Test helper, modified: `tests/helpers/db.ts` (add `seedOneOfEach`)

**Interfaces:**
- Consumes: `Db` from `lib/db/client.ts` (Milestone 1). `company`, `opportunity`, `stage`, `person`, `opportunityPerson`, `event`, `profile` tables from `lib/db/schema` (Task 1 and Milestone 1). `StageKind` from `lib/pipeline/kinds.ts`. `StageStatus`, `StageFormat`, `WorkMode`, `OpportunitySource`, `OpportunityStatus`, `ClosedReason`, `FitStatus`, `PersonRole`, `EventKind` from `lib/pipeline/values.ts` (Task 1). `makeTestDb`, `createTestUser` from `tests/helpers/db.ts`.
- Produces (copied from the frame character for character):

```typescript
export type Scoped = ReturnType<typeof scoped>;
export function scoped(db: Db, userId: string): {
  userId: string;
  transaction<T>(fn: (tx: Scoped) => Promise<T>): Promise<T>;
  profile: { get(): Promise<ProfileRow | null>; upsert(values: Partial<ProfileFields>): Promise<ProfileRow> };
  company: {
    getById(id: string): Promise<CompanyRow | null>;
    findByNameKey(nameKey: string): Promise<CompanyRow | null>;
    list(): Promise<CompanyRow[]>;
    insert(values: CompanyFields): Promise<CompanyRow>;
    update(id: string, values: Partial<CompanyFields>): Promise<CompanyRow | null>;
  };
  opportunity: {
    getById(id: string): Promise<OpportunityRow | null>;
    getBySlug(slug: string): Promise<OpportunityRow | null>;
    lockById(id: string): Promise<OpportunityRow | null>;
    listBoard(): Promise<BoardCard[]>;
    listClosed(): Promise<ClosedCard[]>;
    listSlugsWithPrefix(prefix: string): Promise<string[]>;
    findByCompanyAndRole(companyId: string, roleTitle: string): Promise<OpportunityRow | null>;
    insert(values: OpportunityFields): Promise<OpportunityRow>;
    update(id: string, values: Partial<OpportunityFields>): Promise<OpportunityRow | null>;
  };
  stage: {
    listForOpportunity(opportunityId: string): Promise<StageRow[]>;
    insert(values: StageFields): Promise<StageRow>;
    insertMany(values: StageFields[]): Promise<StageRow[]>;
    update(id: string, values: Partial<StageFields>): Promise<StageRow | null>;
    remove(id: string): Promise<StageRow | null>;
    renumber(opportunityId: string, orderedIds: string[]): Promise<void>;
  };
  person: {
    getById(id: string): Promise<PersonRow | null>;
    listForCompany(companyId: string): Promise<PersonRow[]>;
    insert(values: PersonFields): Promise<PersonRow>;
    update(id: string, values: Partial<PersonFields>): Promise<PersonRow | null>;
  };
  opportunityPerson: {
    listForOpportunity(opportunityId: string): Promise<LinkedPerson[]>;
    link(values: OpportunityPersonFields): Promise<OpportunityPersonRow>;
    update(id: string, values: Partial<OpportunityPersonFields>): Promise<OpportunityPersonRow | null>;
    unlink(id: string): Promise<OpportunityPersonRow | null>;
  };
  event: {
    insert(values: EventFields): Promise<EventRow>;
    listForOpportunity(opportunityId: string): Promise<EventRow[]>;
  };
};
export function scopedFor(userId: string): Scoped;
```

  Plus, exported next to each table's helpers: `ProfileFields`, `CompanyRow`, `CompanyFields`, `OpportunityRow`, `OpportunityFields`, `StageRow`, `StageFields`, `PersonRow`, `PersonFields`, `OpportunityPersonRow`, `OpportunityPersonFields`, `EventRow`, `EventFields`, `BoardCard`, `ClosedCard`, `LinkedPerson`, all re-exported from `lib/db/scoped/index.ts`. `XFields` is `Omit<typeof table.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">`; `XRow` is `typeof table.$inferSelect`.

- [ ] **Step 1: Write the failing isolation matrix test**

This test drives the whole task: every helper in every per-table file below exists because this test calls it. Add a seeding helper to the existing `tests/helpers/db.ts` first (it needs `Scoped`, which does not exist until Step 2, so this file will not type-check until then; that is expected).

Edit `tests/helpers/db.ts`, adding these imports and this function (keep the existing `makeTestDb` and `createTestUser`):

```typescript
import type { Scoped } from "@/lib/db/scoped";

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
```

Create `tests/integration/scoped-isolation.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser, seedOneOfEach, type SeededIds } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";

type Case = {
  name: string;
  run: (a: Scoped, b: Scoped, ids: SeededIds) => Promise<void>;
};

const cases: Case[] = [
  {
    name: "company.getById hides A's row from B",
    run: async (a, b, ids) => {
      expect(await b.company.getById(ids.companyId)).toBeNull();
      expect(await a.company.getById(ids.companyId)).not.toBeNull();
    },
  },
  {
    name: "company.findByNameKey hides A's row from B",
    run: async (a, b) => {
      expect(await b.company.findByNameKey("acmerobotics")).toBeNull();
      expect(await a.company.findByNameKey("acmerobotics")).not.toBeNull();
    },
  },
  {
    name: "company.list excludes A's rows for B",
    run: async (a, b) => {
      expect(await b.company.list()).toEqual([]);
      expect((await a.company.list()).length).toBeGreaterThan(0);
    },
  },
  {
    name: "company.update cannot touch A's row from B",
    run: async (a, b, ids) => {
      expect(await b.company.update(ids.companyId, { name: "Hacked" })).toBeNull();
      expect((await a.company.getById(ids.companyId))?.name).toBe("Acme Robotics");
    },
  },
  {
    name: "company.insert ignores a smuggled userId",
    run: async (a, b) => {
      const row = await a.company.insert({
        name: "Northwind Labs",
        nameKey: "northwindlabs",
        userId: b.userId,
      } as never);
      expect(row.userId).toBe(a.userId);
      expect(await b.company.findByNameKey("northwindlabs")).toBeNull();
    },
  },
  {
    name: "opportunity.getById and getBySlug hide A's row from B",
    run: async (a, b, ids) => {
      expect(await b.opportunity.getById(ids.opportunityId)).toBeNull();
      const row = await a.opportunity.getById(ids.opportunityId);
      expect(row).not.toBeNull();
      expect(await b.opportunity.getBySlug(row!.slug)).toBeNull();
      expect(await a.opportunity.getBySlug(row!.slug)).not.toBeNull();
    },
  },
  {
    name: "opportunity.lockById hides A's row from B and returns A's row inside a transaction",
    run: async (a, b, ids) => {
      expect(await b.opportunity.lockById(ids.opportunityId)).toBeNull();
      const locked = await a.transaction(async (tx) => tx.opportunity.lockById(ids.opportunityId));
      expect(locked?.id).toBe(ids.opportunityId);
    },
  },
  {
    name: "opportunity.listBoard and listClosed exclude A's rows for B",
    run: async (a, b) => {
      expect(await b.opportunity.listBoard()).toEqual([]);
      expect(await b.opportunity.listClosed()).toEqual([]);
      expect((await a.opportunity.listBoard()).length).toBeGreaterThan(0);
    },
  },
  {
    name: "opportunity.listSlugsWithPrefix excludes A's slugs for B",
    run: async (a, b) => {
      expect(await b.opportunity.listSlugsWithPrefix("acme-designer")).toEqual([]);
      expect((await a.opportunity.listSlugsWithPrefix("acme-designer")).length).toBeGreaterThan(0);
    },
  },
  {
    name: "opportunity.findByCompanyAndRole hides A's row from B",
    run: async (a, b, ids) => {
      expect(await b.opportunity.findByCompanyAndRole(ids.companyId, "Product Designer")).toBeNull();
      expect(await a.opportunity.findByCompanyAndRole(ids.companyId, "Product Designer")).not.toBeNull();
    },
  },
  {
    name: "opportunity.update cannot touch A's row from B",
    run: async (a, b, ids) => {
      expect(await b.opportunity.update(ids.opportunityId, { roleTitle: "Hacked" })).toBeNull();
      expect((await a.opportunity.getById(ids.opportunityId))?.roleTitle).toBe("Product Designer");
    },
  },
  {
    name: "opportunity.insert ignores a smuggled userId",
    run: async (a, b, ids) => {
      const row = await a.opportunity.insert({
        companyId: ids.companyId,
        slug: "smuggled-insert-test",
        roleTitle: "Smuggled",
        userId: b.userId,
      } as never);
      expect(row.userId).toBe(a.userId);
      expect(await b.opportunity.getBySlug("smuggled-insert-test")).toBeNull();
    },
  },
  {
    name: "stage.listForOpportunity returns empty for B",
    run: async (a, b, ids) => {
      expect(await b.stage.listForOpportunity(ids.opportunityId)).toEqual([]);
      expect((await a.stage.listForOpportunity(ids.opportunityId)).length).toBeGreaterThan(0);
    },
  },
  {
    name: "stage.update and remove cannot touch A's row from B",
    run: async (a, b, ids) => {
      expect(await b.stage.update(ids.stageId, { label: "Hacked" })).toBeNull();
      expect(await b.stage.remove(ids.stageId)).toBeNull();
      const stages = await a.stage.listForOpportunity(ids.opportunityId);
      expect(stages.find((s) => s.id === ids.stageId)?.label).toBe("Saved");
    },
  },
  {
    name: "stage.insert and insertMany ignore a smuggled userId",
    run: async (a, b, ids) => {
      const one = await a.stage.insert({
        opportunityId: ids.opportunityId,
        kind: "applied",
        label: "Applied",
        position: 1,
        userId: b.userId,
      } as never);
      expect(one.userId).toBe(a.userId);
      const many = await a.stage.insertMany([
        { opportunityId: ids.opportunityId, kind: "offer", label: "Offer", position: 2, userId: b.userId } as never,
      ]);
      expect(many[0].userId).toBe(a.userId);
      expect(await b.stage.listForOpportunity(ids.opportunityId)).toEqual([]);
    },
  },
  {
    name: "stage.renumber reorders five stages with no gaps or duplicates",
    run: async (a, b, ids) => {
      void b;
      const extra = await Promise.all(
        [1, 2, 3, 4].map((position) =>
          a.stage.insert({ opportunityId: ids.opportunityId, kind: "applied", label: `S${position}`, position }),
        ),
      );
      const all = [ids.stageId, ...extra.map((s) => s.id)];
      const reversed = [...all].reverse();
      await a.stage.renumber(ids.opportunityId, reversed);
      const after = await a.stage.listForOpportunity(ids.opportunityId);
      const positions = reversed.map((id) => after.find((s) => s.id === id)!.position);
      expect(positions).toEqual([0, 1, 2, 3, 4]);
      expect(new Set(after.map((s) => s.position)).size).toBe(5);
    },
  },
  {
    name: "stage.renumber places an inserted stage in the middle",
    run: async (a, b, ids) => {
      void b;
      const extra = await Promise.all(
        [1, 2, 3, 4].map((position) =>
          a.stage.insert({ opportunityId: ids.opportunityId, kind: "applied", label: `S${position}`, position }),
        ),
      );
      const existing = [ids.stageId, ...extra.map((s) => s.id)];
      const inserted = await a.stage.insert({
        opportunityId: ids.opportunityId,
        kind: "panel_final",
        label: "Panel",
        position: 99,
      });
      const order = [...existing.slice(0, 2), inserted.id, ...existing.slice(2)];
      await a.stage.renumber(ids.opportunityId, order);
      const after = await a.stage.listForOpportunity(ids.opportunityId);
      expect(after.find((s) => s.id === inserted.id)?.position).toBe(2);
      expect(new Set(after.map((s) => s.position)).size).toBe(6);
      expect(Math.max(...after.map((s) => s.position))).toBe(5);
    },
  },
  {
    name: "person.getById and listForCompany hide A's rows from B",
    run: async (a, b, ids) => {
      expect(await b.person.getById(ids.personId)).toBeNull();
      expect(await b.person.listForCompany(ids.companyId)).toEqual([]);
      expect((await a.person.listForCompany(ids.companyId)).length).toBeGreaterThan(0);
    },
  },
  {
    name: "person.update cannot touch A's row from B",
    run: async (a, b, ids) => {
      expect(await b.person.update(ids.personId, { name: "Hacked" })).toBeNull();
      expect((await a.person.getById(ids.personId))?.name).toBe("Priya Raman");
    },
  },
  {
    name: "person.insert ignores a smuggled userId",
    run: async (a, b, ids) => {
      const row = await a.person.insert({
        companyId: ids.companyId,
        name: "Second Person",
        userId: b.userId,
      } as never);
      expect(row.userId).toBe(a.userId);
      expect(await b.person.listForCompany(ids.companyId)).toEqual([]);
    },
  },
  {
    name: "opportunityPerson.listForOpportunity hides A's link from B",
    run: async (a, b, ids) => {
      expect(await b.opportunityPerson.listForOpportunity(ids.opportunityId)).toEqual([]);
      expect((await a.opportunityPerson.listForOpportunity(ids.opportunityId)).length).toBeGreaterThan(0);
    },
  },
  {
    name: "opportunityPerson.update and unlink cannot touch A's row from B",
    run: async (a, b, ids) => {
      expect(await b.opportunityPerson.update(ids.linkId, { role: "referrer" })).toBeNull();
      expect(await b.opportunityPerson.unlink(ids.linkId)).toBeNull();
      const links = await a.opportunityPerson.listForOpportunity(ids.opportunityId);
      expect(links.find((l) => l.linkId === ids.linkId)?.role).toBe("recruiter");
    },
  },
  {
    name: "opportunityPerson.link ignores a smuggled userId",
    run: async (a, b, ids) => {
      const person = await a.person.insert({ companyId: ids.companyId, name: "Third Person" });
      const link = await a.opportunityPerson.link({
        opportunityId: ids.opportunityId,
        personId: person.id,
        role: "referrer",
        userId: b.userId,
      } as never);
      expect(link.userId).toBe(a.userId);
    },
  },
  {
    name: "event.listForOpportunity hides A's events from B",
    run: async (a, b, ids) => {
      expect(await b.event.listForOpportunity(ids.opportunityId)).toEqual([]);
      expect((await a.event.listForOpportunity(ids.opportunityId)).length).toBeGreaterThan(0);
    },
  },
  {
    name: "event.insert ignores a smuggled userId",
    run: async (a, b, ids) => {
      const row = await a.event.insert({
        opportunityId: ids.opportunityId,
        kind: "note",
        userId: b.userId,
      } as never);
      expect(row.userId).toBe(a.userId);
    },
  },
];

describe("scoped tenant isolation", () => {
  for (const testCase of cases) {
    it(testCase.name, async () => {
      const { db, close } = await makeTestDb();
      try {
        const userA = await createTestUser(db, `a-${Math.random().toString(36).slice(2)}@example.com`);
        const userB = await createTestUser(db, `b-${Math.random().toString(36).slice(2)}@example.com`);
        const a = scoped(db, userA.id);
        const b = scoped(db, userB.id);
        const ids = await seedOneOfEach(a);
        await testCase.run(a, b, ids);
      } finally {
        await close();
      }
    });
  }
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/scoped-isolation.test.ts
```

Expected: fails with `Cannot find module '@/lib/db/scoped'` (or, once the folder exists but is incomplete, individual case failures naming the missing method).

- [ ] **Step 3: Verify the transaction typing before writing it**

Drizzle's `db.transaction()` calls its callback with a `PgTransaction`, not a `Db`. `PgTransaction<TQueryResult, TFullSchema, TSchema> extends PgDatabase<TQueryResult, TFullSchema, TSchema>` (`node_modules/drizzle-orm/pg-core/session.d.ts`), and `Db` is `PgDatabase<PgQueryResultHKT, typeof schema>` using the same default third parameter on both sides, so the transaction's `tx` is a direct subtype of `Db` and needs no cast. Verified in a planning scratch file (`transaction-spike.ts`, not kept in the repo) (`tsc --noEmit --strict` exits 0 for `db.transaction((tx) => fn(scoped(tx, userId)))` with `tx` passed straight into `scoped`'s `db: Db` parameter). Use exactly that form below.

- [ ] **Step 4: Write the strip helper**

Create `lib/db/scoped/strip.ts` (moved from the old `lib/db/scoped.ts` unchanged):

```typescript
export function stripScopedKeys<T extends object>(
  values: T,
): Omit<T, "userId" | "createdAt" | "updatedAt"> {
  const clone = { ...values } as Record<string, unknown>;
  delete clone.userId;
  delete clone.createdAt;
  delete clone.updatedAt;
  return clone as Omit<T, "userId" | "createdAt" | "updatedAt">;
}
```

- [ ] **Step 5: Write the profile helpers**

Create `lib/db/scoped/profile.ts` (moved from the old `lib/db/scoped.ts`; behavior unchanged):

```typescript
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type ProfileRow = typeof schema.profile.$inferSelect;
export type ProfileFields = Omit<
  typeof schema.profile.$inferInsert,
  "userId" | "createdAt" | "updatedAt"
>;

export function profileQueries(db: Db, userId: string) {
  return {
    async get(): Promise<ProfileRow | null> {
      const [row] = await db.select().from(schema.profile).where(eq(schema.profile.userId, userId));
      return row ?? null;
    },
    async upsert(values: Partial<ProfileFields>): Promise<ProfileRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(schema.profile)
        .values({ ...fields, userId })
        .onConflictDoUpdate({
          target: schema.profile.userId,
          set: { ...fields, updatedAt: new Date() },
        })
        .returning();
      return row;
    },
  };
}
```

- [ ] **Step 6: Write company, person and stage helpers (signatures and algorithms only; the general rules already state the pattern)**

Every method below follows the rules already given in the frame and repeated here once: every read filters on `user_id = userId`; every write passes its values through `stripScopedKeys` and sets `userId` last, so a smuggled `userId` in the input is discarded; `update` and `remove` add `and user_id = userId` and return the matched row or `null` when nothing matched; every `update` also sets `updatedAt: new Date()` in its `set` clause.

Create `lib/db/scoped/company.ts` with `CompanyRow = typeof schema.company.$inferSelect`, `CompanyFields = Omit<typeof schema.company.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">`, and a `companyQueries(db: Db, userId: string)` factory returning:

- `getById(id: string): Promise<CompanyRow | null>`: select where `id = id and user_id = userId`, return the row or `null`.
- `findByNameKey(nameKey: string): Promise<CompanyRow | null>`: select where `name_key = nameKey and user_id = userId`, return the row or `null`. Relies on the `unique(user_id, name_key)` constraint from Task 1 to make "the row" unambiguous.
- `list(): Promise<CompanyRow[]>`: select where `user_id = userId`, `orderBy(schema.company.name)`.
- `insert(values: CompanyFields): Promise<CompanyRow>`: `stripScopedKeys(values)`, insert with `userId` appended last, `.returning()`, return the single row.
- `update(id: string, values: Partial<CompanyFields>): Promise<CompanyRow | null>`: `stripScopedKeys(values)`, update `set { ...fields, updatedAt: new Date() }` where `id = id and user_id = userId`, `.returning()`, return the row or `null` when the where clause matched nothing (a missing row and another user's row look the same: zero matches).

Create `lib/db/scoped/person.ts` with `PersonRow`, `PersonFields` the same way, and `personQueries(db, userId)` returning:

- `getById(id: string): Promise<PersonRow | null>`: same pattern as `company.getById`.
- `listForCompany(companyId: string): Promise<PersonRow[]>`: select where `company_id = companyId and user_id = userId`, `orderBy(schema.person.name)`. Filtering on `user_id` here (not only `company_id`) is what stops user B from listing people by guessing user A's `companyId`.
- `insert(values: PersonFields): Promise<PersonRow>`: same pattern as `company.insert`.
- `update(id, values): Promise<PersonRow | null>`: same pattern as `company.update`.

Create `lib/db/scoped/stage.ts` with `StageRow`, `StageFields` the same way, and `stageQueries(db, userId)` returning:

- `listForOpportunity(opportunityId: string): Promise<StageRow[]>`: select where `opportunity_id = opportunityId and user_id = userId`, `orderBy(schema.stage.position)`.
- `insert(values: StageFields): Promise<StageRow>`: same pattern as `company.insert`.
- `insertMany(values: StageFields[]): Promise<StageRow[]>`: map each element through `stripScopedKeys` and append `userId`, one `db.insert(schema.stage).values(rows).returning()` call, return the array. Edge case: an empty array input returns an empty array without querying (Drizzle's `.values([])` throws; guard for it).
- `update(id, values): Promise<StageRow | null>`: same pattern as `company.update`.
- `remove(id: string): Promise<StageRow | null>`: `db.delete(schema.stage).where(and(eq(schema.stage.id, id), eq(schema.stage.userId, userId))).returning()`, return the deleted row or `null`.
- `renumber(opportunityId: string, orderedIds: string[]): Promise<void>`: full code below (Step 7).

- [ ] **Step 7: Write `stage.renumber` in full**

D4: a single `UPDATE ... SET position = position + 1 WHERE ...` fails on the `unique(opportunity_id, position)` constraint the moment two rows' new positions collide with each other's old ones (proved in a planning scratch file (`check.mjs`, not kept in the repo)). The fix is two statements: first move every row for this opportunity far out of the way, then set each row to its final index in one bulk `UPDATE ... CASE`. Postgres cannot always infer a bind parameter's type from its position inside a `CASE`, so both the compared id and the assigned position need an explicit cast; without it, PGlite defaults the whole expression to `text` and the second statement fails with "column position is of type integer but expression is of type text". Verified end to end in a planning scratch file (`renumber-spike.mjs`, not kept in the repo) (a reorder of five rows and an insert-in-the-middle of six both land on `0..n-1` with no gaps or duplicates).

Add to `lib/db/scoped/stage.ts`:

```typescript
import { and, eq, inArray, sql } from "drizzle-orm";

// ...inside stageQueries(db, userId), alongside the methods from Step 6:
async renumber(opportunityId: string, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;

  await db
    .update(schema.stage)
    .set({ position: sql`${schema.stage.position} + 1000`, updatedAt: new Date() })
    .where(and(eq(schema.stage.userId, userId), eq(schema.stage.opportunityId, opportunityId)));

  const cases = orderedIds.map((id, index) => sql`when ${id}::uuid then ${index}::integer`);
  await db
    .update(schema.stage)
    .set({
      position: sql`(case ${schema.stage.id} ${sql.join(cases, sql` `)} end)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.stage.userId, userId),
        eq(schema.stage.opportunityId, opportunityId),
        inArray(schema.stage.id, orderedIds),
      ),
    );
},
```

- [ ] **Step 8: Write `opportunity.lockById` in full**

`SELECT ... FOR UPDATE` is Drizzle's `.for("update")` on a select query (`node_modules/drizzle-orm/pg-core/query-builders/select.d.ts`). Verified against the PGlite driver inside `db.transaction()` in a planning scratch file (`lock-spike.mjs`, not kept in the repo). It only has locking effect when called on the transaction's own `tx` (so through `Scoped.transaction`, never on the top-level `db`), which is why D5 requires every persistence function to open its own transaction before calling this.

Add to `lib/db/scoped/opportunity.ts`:

```typescript
async lockById(id: string): Promise<OpportunityRow | null> {
  const [row] = await db
    .select()
    .from(schema.opportunity)
    .where(and(eq(schema.opportunity.id, id), eq(schema.opportunity.userId, userId)))
    .for("update");
  return row ?? null;
},
```

- [ ] **Step 9: Write the rest of `opportunity`'s helpers (signatures and algorithms only)**

In `lib/db/scoped/opportunity.ts`, with `OpportunityRow = typeof schema.opportunity.$inferSelect` and `OpportunityFields = Omit<typeof schema.opportunity.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">`:

- `getById(id: string): Promise<OpportunityRow | null>`: same pattern as `company.getById`.
- `getBySlug(slug: string): Promise<OpportunityRow | null>`: select where `slug = slug and user_id = userId`.
- `listSlugsWithPrefix(prefix: string): Promise<string[]>`: select `slug` where `user_id = userId and like(schema.opportunity.slug, prefix + "%")` (Drizzle's `like` from `drizzle-orm`, which binds `prefix + "%"` as one parameter, never string-concatenated into raw SQL), map the rows to plain strings. Every caller in this milestone passes a value already produced by `baseSlug` (Task 3), which is ASCII kebab-case and can never itself contain a `%` or `_` wildcard character, so no separate escaping step is needed. Used by `uniqueSlug` (Task 3) inside `createOpportunity` (Task 4) to find the next free suffix.
- `findByCompanyAndRole(companyId: string, roleTitle: string): Promise<OpportunityRow | null>`: select where `company_id = companyId and user_id = userId`, and an exact case-insensitive comparison on the role: ``sql`lower(${schema.opportunity.roleTitle}) = ${roleTitle.trim().toLowerCase()}` `` (`sql` from `drizzle-orm`). This is a plain equality on the lowercased column, not a pattern match, so it does not use `ilike`: in an `ilike` pattern the characters `%` and `_` are wildcards, so a stored role like `"UX-UI Designer"` would be over-matched by a lookup for `"UX_UI Designer"`. `orderBy` on `createdAt` descending, return the first row or `null`. Multiple historical (closed) opportunities can share a company and role (re-applying a year later, spec 5.5), so this can match more than one row over an opportunity's lifetime; `createOpportunity` (Task 4) is responsible for checking the returned row's `status`, this helper just returns the most recent match.
- `insert(values: OpportunityFields): Promise<OpportunityRow>`: same pattern as `company.insert`.
- `update(id, values): Promise<OpportunityRow | null>`: same pattern as `company.update`.

- [ ] **Step 10: Write `listBoard` and `listClosed` in full**

Both join `opportunity` to `company` and to `stage` (on `currentStageId` for the board, `closedStageId` for the closed list), scoped to `userId` on every table involved, not just the leading `opportunity` filter, so a hypothetical future bug that let `current_stage_id` point at the wrong row cannot leak another user's stage label into this read. `closedReason` and `closedAt` are nullable columns at the type level, but `opportunity_closed_consistency` (Task 1) guarantees they are set whenever `status = 'closed'`, which is what every row here satisfies; the two non-null assertions below are safe for that reason, not a shortcut.

Add to `lib/db/scoped/opportunity.ts`:

```typescript
import { and, desc, eq } from "drizzle-orm";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { ClosedReason } from "@/lib/pipeline/values";

export type BoardCard = {
  id: string; slug: string; roleTitle: string; companyName: string; fitScore: number | null;
  nextAction: string | null; nextActionAt: Date | null; updatedAt: Date;
  stage: { id: string; kind: StageKind; label: string; enteredAt: Date | null };
};
export type ClosedCard = {
  id: string; slug: string; roleTitle: string; companyName: string;
  closedReason: ClosedReason; closedAt: Date; closedStageLabel: string | null;
};

// ...inside opportunityQueries(db, userId):
async listBoard(): Promise<BoardCard[]> {
  const rows = await db
    .select({
      id: schema.opportunity.id,
      slug: schema.opportunity.slug,
      roleTitle: schema.opportunity.roleTitle,
      companyName: schema.company.name,
      fitScore: schema.opportunity.fitScore,
      nextAction: schema.opportunity.nextAction,
      nextActionAt: schema.opportunity.nextActionAt,
      updatedAt: schema.opportunity.updatedAt,
      stageId: schema.stage.id,
      stageKind: schema.stage.kind,
      stageLabel: schema.stage.label,
      stageEnteredAt: schema.stage.enteredAt,
    })
    .from(schema.opportunity)
    .innerJoin(
      schema.company,
      and(eq(schema.company.userId, userId), eq(schema.company.id, schema.opportunity.companyId)),
    )
    .innerJoin(
      schema.stage,
      and(eq(schema.stage.userId, userId), eq(schema.stage.id, schema.opportunity.currentStageId)),
    )
    .where(and(eq(schema.opportunity.userId, userId), eq(schema.opportunity.status, "active")));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    roleTitle: r.roleTitle,
    companyName: r.companyName,
    fitScore: r.fitScore,
    nextAction: r.nextAction,
    nextActionAt: r.nextActionAt,
    updatedAt: r.updatedAt,
    stage: { id: r.stageId, kind: r.stageKind as StageKind, label: r.stageLabel, enteredAt: r.stageEnteredAt },
  }));
},

async listClosed(): Promise<ClosedCard[]> {
  const rows = await db
    .select({
      id: schema.opportunity.id,
      slug: schema.opportunity.slug,
      roleTitle: schema.opportunity.roleTitle,
      companyName: schema.company.name,
      closedReason: schema.opportunity.closedReason,
      closedAt: schema.opportunity.closedAt,
      closedStageLabel: schema.stage.label,
    })
    .from(schema.opportunity)
    .innerJoin(
      schema.company,
      and(eq(schema.company.userId, userId), eq(schema.company.id, schema.opportunity.companyId)),
    )
    .leftJoin(
      schema.stage,
      and(eq(schema.stage.userId, userId), eq(schema.stage.id, schema.opportunity.closedStageId)),
    )
    .where(and(eq(schema.opportunity.userId, userId), eq(schema.opportunity.status, "closed")))
    .orderBy(desc(schema.opportunity.closedAt));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    roleTitle: r.roleTitle,
    companyName: r.companyName,
    // Safe: opportunity_closed_consistency (Task 1) guarantees these are
    // non-null whenever status = 'closed', which this query already filters on.
    closedReason: r.closedReason as ClosedReason,
    closedAt: r.closedAt as Date,
    closedStageLabel: r.closedStageLabel,
  }));
},
```

`listClosed` left-joins `stage` (not inner) because `closedStageLabel` is typed `string | null`: a row with no matching stage (there is no realistic path to this today, since `closeOpportunity` in Task 4 always sets `closedStageId` from the current stage, but the column itself has no `NOT NULL` or FK-driven guarantee) still appears in the closed list with `closedStageLabel: null`, instead of silently vanishing the way an inner join would make it.

- [ ] **Step 11: Write `opportunity_person` and `event` helpers (signatures and algorithms only)**

Create `lib/db/scoped/opportunity-person.ts` with `OpportunityPersonRow = typeof schema.opportunityPerson.$inferSelect`, `OpportunityPersonFields = Omit<typeof schema.opportunityPerson.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">`, `LinkedPerson = { linkId: string; role: PersonRole; stageId: string | null; person: PersonRow }` (import `PersonRow` from `./person`), and `opportunityPersonQueries(db, userId)` returning:

- `listForOpportunity(opportunityId: string): Promise<LinkedPerson[]>`: inner join `opportunity_person` to `person` on `person.id = opportunity_person.person_id and person.user_id = userId`, where `opportunity_person.opportunity_id = opportunityId and opportunity_person.user_id = userId`; map each row to `{ linkId: link.id, role: link.role, stageId: link.stageId, person: {...the joined person columns} }`.
- `link(values: OpportunityPersonFields): Promise<OpportunityPersonRow>`: same insert pattern as `company.insert`. Named `link`, not `insert`, because the frame's produced interface calls it that.
- `update(id, values): Promise<OpportunityPersonRow | null>`: same pattern as `company.update`.
- `unlink(id: string): Promise<OpportunityPersonRow | null>`: same delete pattern as `stage.remove`.

Create `lib/db/scoped/event.ts` with `EventRow`, `EventFields` the same way, and `eventQueries(db, userId)` returning:

- `insert(values: EventFields): Promise<EventRow>`: same pattern as `company.insert`.
- `listForOpportunity(opportunityId: string): Promise<EventRow[]>`: select where `opportunity_id = opportunityId and user_id = userId`, `orderBy(desc(schema.event.occurredAt))`.

- [ ] **Step 12: Assemble `lib/db/scoped/index.ts`**

```typescript
import type { Db } from "../client";
import { profileQueries } from "./profile";
import { companyQueries } from "./company";
import { opportunityQueries } from "./opportunity";
import { stageQueries } from "./stage";
import { personQueries } from "./person";
import { opportunityPersonQueries } from "./opportunity-person";
import { eventQueries } from "./event";
import { getDb } from "../client";

export * from "./strip";
export * from "./profile";
export * from "./company";
export * from "./opportunity";
export * from "./stage";
export * from "./person";
export * from "./opportunity-person";
export * from "./event";

export function scoped(db: Db, userId: string) {
  return {
    userId,
    async transaction<T>(fn: (tx: Scoped) => Promise<T>): Promise<T> {
      return db.transaction((tx) => fn(scoped(tx, userId)));
    },
    profile: profileQueries(db, userId),
    company: companyQueries(db, userId),
    opportunity: opportunityQueries(db, userId),
    stage: stageQueries(db, userId),
    person: personQueries(db, userId),
    opportunityPerson: opportunityPersonQueries(db, userId),
    event: eventQueries(db, userId),
  };
}

export type Scoped = ReturnType<typeof scoped>;

export function scopedFor(userId: string): Scoped {
  return scoped(getDb(), userId);
}
```

Each `*Queries(db, userId)` factory function above is the "signature and algorithm" form from Steps 6, 9 and 11: a plain function taking `(db: Db, userId: string)` and returning the object of methods listed for that table. This keeps every table's methods and its `XRow`/`XFields` types in one file, and keeps `scoped()` itself a short composition, matching how `scopedFor` already composed `scoped` and `getDb` in Milestone 1.

- [ ] **Step 13: Delete the old file**

```bash
rm lib/db/scoped.ts
```

- [ ] **Step 14: Run the isolation matrix and confirm it passes**

```bash
pnpm exec vitest run tests/integration/scoped-isolation.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 25 passed (25)`.

- [ ] **Step 15: Confirm the existing scoped tests are still green**

`tests/integration/scoped.test.ts` imports `scoped` from `@/lib/db/scoped` and only exercises `profile`, which moved unchanged into `lib/db/scoped/profile.ts`.

```bash
pnpm exec vitest run tests/integration/scoped.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 3 passed (3)`.

- [ ] **Step 16: Confirm the ESLint rule still blocks `lib/db/client` from `app/` and `components/`**

The rule in `eslint.config.mjs` matches on import specifier text (`@/lib/db/client`, or a relative path ending in `lib/db/client` or `db/client`), not on the resolved file, so moving `scoped.ts` into a folder does not touch it.

```bash
pnpm lint
```

Expected: exits 0.

- [ ] **Step 17: Run the wider checks**

```bash
pnpm typecheck
pnpm test
```

Expected: both exit 0.

- [ ] **Step 18: Commit**

```bash
git add lib/db/scoped.ts lib/db/scoped tests/integration/scoped-isolation.test.ts tests/helpers/db.ts
git commit -m "$(cat <<'EOF'
refactor: split the scoped query helper into one file per table

EOF
)"
```

---

### Task 3: Result, name key, slug, pipeline rules (pure)

**Files:**
- Create: `lib/result.ts`, `lib/companies/name-key.ts`, `lib/pipeline/slug.ts`, `lib/pipeline/rules.ts`
- Test: `tests/unit/result.test.ts`, `tests/unit/name-key.test.ts`, `tests/unit/slug.test.ts`, `tests/unit/pipeline-rules.test.ts`
- Test helpers, created: `tests/helpers/result.ts`, `tests/helpers/pipeline-state.ts`

**Interfaces:**
- Consumes: `STAGE_KINDS`, `StageKind` from `lib/pipeline/kinds.ts` (Milestone 1). `StageStatus` from `lib/pipeline/values.ts` (Task 1). Nothing from `lib/db`: this task's `lib/` files have no database imports (D5).
- Produces (copied from the frame character for character):

```typescript
// lib/result.ts
export type Result<T, C extends string = string> = { ok: true; data: T } | { ok: false; code: C; message: string };
export function ok<T>(data: T): Result<T, never>;
export function fail<C extends string>(code: C, message: string): Result<never, C>;

// lib/companies/name-key.ts
export function companyNameKey(name: string): string;

// lib/pipeline/slug.ts
export function baseSlug(company: string, role: string): string;
export function uniqueSlug(base: string, taken: string[]): string;

// lib/pipeline/rules.ts
export type StageState = {
  id: string; kind: StageKind; label: string; position: number; status: StageStatus;
  scheduledAt: Date | null; enteredAt: Date | null; completedAt: Date | null; hasArtifacts: boolean;
};
export type OpportunityState = { status: "active" | "closed"; currentStageId: string; stages: StageState[] };
export type MoveTarget = { stageId: string } | { kind: StageKind };
export const NEW_STAGE = "new" as const;
export type StagePatch = { id: string | typeof NEW_STAGE; status?: StageStatus; enteredAt?: Date; completedAt?: Date | null; label?: string };
export type StageDraft = { kind: StageKind; label: string };
export type MovePlan = {
  create: StageDraft | null;
  order: (string | typeof NEW_STAGE)[] | null;
  patches: StagePatch[];
  currentStageId: string | typeof NEW_STAGE;
  from: { stageId: string; kind: StageKind; label: string };
  to: { stageId: string | typeof NEW_STAGE; kind: StageKind; label: string };
};
export type MoveError = "closed" | "not_found" | "same_stage" | "same_column";
export type EditError = "closed" | "not_found" | "fixed_stage" | "stage_current" | "stage_done" | "stage_has_artifacts" | "invalid_order" | "label_required" | "not_skippable" | "not_skipped";

export function defaultStages(): StageDraft[];
export function placementIndex(stages: StageState[], kind: StageKind): number;
export function nextStageId(state: OpportunityState): string | null;
export function planMove(state: OpportunityState, target: MoveTarget, now: Date): Result<MovePlan, MoveError>;
export function planAddStage(state: OpportunityState, kind: StageKind, label: string): Result<{ create: StageDraft; order: (string | typeof NEW_STAGE)[] }, EditError>;
export function planReorder(state: OpportunityState, orderedIds: string[]): Result<{ order: string[] }, EditError>;
export function planRename(state: OpportunityState, stageId: string, label: string): Result<StagePatch, EditError>;
export function planSkip(state: OpportunityState, stageId: string): Result<StagePatch, EditError>;
export function planUnskip(state: OpportunityState, stageId: string, now: Date): Result<StagePatch, EditError>;
export function planRemove(state: OpportunityState, stageId: string): Result<{ order: string[] }, EditError>;

// tests/helpers/result.ts
export function expectOk<T>(result: Result<T, string>): T;
export function expectFail<C extends string>(result: Result<unknown, C>, code: C): void;

// tests/helpers/pipeline-state.ts
export type StageSpec = {
  kind: StageKind; label?: string; status?: StageStatus;
  scheduledAt?: Date | null; enteredAt?: Date | null; completedAt?: Date | null; hasArtifacts?: boolean;
};
export function buildState(specs: StageSpec[], currentIndex: number, status?: "active" | "closed"): OpportunityState;
```

`OpportunityState.stages` is always sorted by `position`; every function below relies on that instead of re-sorting.

- [ ] **Step 1: Write `lib/result.ts` in full**

```typescript
export type Result<T, C extends string = string> =
  | { ok: true; data: T }
  | { ok: false; code: C; message: string };

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function fail<C extends string>(code: C, message: string): Result<never, C> {
  return { ok: false, code, message };
}
```

Verified in a planning scratch file (`result-spike.ts`, not kept in the repo): `Result<T, never>` is assignable to `Result<T, C>` for any `C` (a `never` field type is assignable to anything), so `ok(...)` and `fail(...)` both slot directly into a function declared to return `Result<SomeType, SomeErrorUnion>`, and `if (!result.ok)` narrows `result` to the failure branch (`code: SomeErrorUnion`, `message: string`) the way every consumer in this plan expects.

Create `tests/unit/result.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { ok, fail } from "@/lib/result";

describe("ok", () => {
  it("wraps data in an ok result", () => {
    expect(ok({ id: "abc" })).toEqual({ ok: true, data: { id: "abc" } });
  });
});

describe("fail", () => {
  it("wraps a code and message in a failure result", () => {
    expect(fail("not_found", "no such row")).toEqual({
      ok: false,
      code: "not_found",
      message: "no such row",
    });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/result.test.ts
```

Expected: fails with `Cannot find module '@/lib/result'`.

- [ ] **Step 3: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/result.test.ts
```

Expected: `Tests 2 passed (2)`.

- [ ] **Step 4: Write the shared test-result helper**

Create `tests/helpers/result.ts`:

```typescript
import { expect } from "vitest";
import type { Result } from "@/lib/result";

export function expectOk<T>(result: Result<T, string>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`expected ok, got failure: ${result.code}: ${result.message}`);
  }
  return result.data;
}

export function expectFail<C extends string>(result: Result<unknown, C>, code: C): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
  }
}
```

This has no dedicated test file of its own: it is a thin wrapper around `expect`, exercised indirectly by every test in this plan that calls it, the same way `scopedFor` in Milestone 1 had no dedicated test because it is a one-line composition of two already-tested functions.

- [ ] **Step 5: Write `companyNameKey` in full**

```typescript
const LEGAL_SUFFIXES = new Set(["inc", "llc", "ltd", "gmbh", "corp", "co", "plc"]);

export function companyNameKey(name: string): string {
  const normalized = name.normalize("NFKD").toLowerCase().replace(/&/g, "and");
  const cleaned = normalized.replace(/[^\p{L}\p{N}\s]/gu, "");
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join("");
}
```

Order matters: `&` is replaced with the word `and` before punctuation is stripped (so the word survives to be joined with the words around it), and the legal-suffix check runs on whitespace-separated words before those words are joined together with no separator (so `"Northwind & Co"` drops the trailing `"co"` token first and only then collapses to `"northwindand"`, rather than the `"co"` becoming unrecoverable inside a single joined string). `\p{L}` and `\p{N}` (Unicode letter and number categories) do not match combining marks, so normalizing to NFKD first and then stripping non-letters also strips accents (`"é"` becomes `"e"`). Verified in a planning scratch file (`name-key-spike.mjs`, not kept in the repo) against the frame's four cases plus an accented name.

Create `lib/companies/name-key.ts` with the code above.

Create `tests/unit/name-key.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { companyNameKey } from "@/lib/companies/name-key";

describe("companyNameKey", () => {
  const cases: [string, string][] = [
    ["Acme, Inc.", "acme"],
    ["ACME inc", "acme"],
    ["Northwind & Co", "northwindand"],
    ["Co", "co"],
    ["Priya Raman Consulting LLC", "priyaramanconsulting"],
    ["Café Kréme", "cafekreme"],
  ];

  for (const [input, expected] of cases) {
    it(`turns ${JSON.stringify(input)} into ${JSON.stringify(expected)}`, () => {
      expect(companyNameKey(input)).toBe(expected);
    });
  }
});
```

- [ ] **Step 6: Run it, confirm it fails, implement, confirm it passes**

```bash
pnpm exec vitest run tests/unit/name-key.test.ts
```

Expected first: fails with `Cannot find module '@/lib/companies/name-key'`. After creating the file: `Tests 6 passed (6)`.

- [ ] **Step 7: Write `baseSlug` and `uniqueSlug` in full**

```typescript
function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function baseSlug(company: string, role: string): string {
  const combined = slugify(`${company} ${role}`);
  const trimmed = combined.slice(0, 60).replace(/-+$/g, "");
  return trimmed.length > 0 ? trimmed : "job";
}

export function uniqueSlug(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
```

Verified in a planning scratch file (`slug-spike.mjs`, not kept in the repo): ASCII kebab-case output, a 60-character cap that never leaves a trailing hyphen, `"job"` for input that slugifies to nothing (blank or all punctuation), and `uniqueSlug` walking `-2`, `-3`, ... past whatever is already taken.

Create `lib/pipeline/slug.ts` with the code above.

Create `tests/unit/slug.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { baseSlug, uniqueSlug } from "@/lib/pipeline/slug";

describe("baseSlug", () => {
  it("builds an ASCII kebab-case slug from company and role", () => {
    expect(baseSlug("Acme Robotics", "Senior Product Designer")).toBe(
      "acme-robotics-senior-product-designer",
    );
  });

  it("strips punctuation and accents", () => {
    expect(baseSlug("Café Kréme", "Barista Lead")).toBe("cafe-kreme-barista-lead");
  });

  it("caps the result at 60 characters with no trailing hyphen", () => {
    const slug = baseSlug("A".repeat(80), "Role");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back to job when there is nothing left to slugify", () => {
    expect(baseSlug("", "")).toBe("job");
    expect(baseSlug("!!!", "###")).toBe("job");
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug unchanged when it is not taken", () => {
    expect(uniqueSlug("acme-designer", [])).toBe("acme-designer");
  });

  it("appends -2 when the base is taken", () => {
    expect(uniqueSlug("acme-designer", ["acme-designer"])).toBe("acme-designer-2");
  });

  it("keeps counting past multiple taken suffixes", () => {
    expect(uniqueSlug("acme-designer", ["acme-designer", "acme-designer-2"])).toBe(
      "acme-designer-3",
    );
  });
});
```

- [ ] **Step 8: Run it, confirm it fails, implement, confirm it passes**

```bash
pnpm exec vitest run tests/unit/slug.test.ts
```

Expected first: fails with `Cannot find module '@/lib/pipeline/slug'`. After creating the file: `Tests 7 passed (7)`.

- [ ] **Step 9: Write the `OpportunityState` builder helper**

Create `tests/helpers/pipeline-state.ts`:

```typescript
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
import type { StageStatus } from "@/lib/pipeline/values";
import type { OpportunityState, StageState } from "@/lib/pipeline/rules";

export type StageSpec = {
  kind: StageKind;
  label?: string;
  status?: StageStatus;
  scheduledAt?: Date | null;
  enteredAt?: Date | null;
  completedAt?: Date | null;
  hasArtifacts?: boolean;
};

export function buildState(
  specs: StageSpec[],
  currentIndex: number,
  status: "active" | "closed" = "active",
): OpportunityState {
  const stages: StageState[] = specs.map((spec, index) => ({
    id: `s${index}`,
    kind: spec.kind,
    label: spec.label ?? STAGE_KINDS.find((k) => k.kind === spec.kind)!.defaultLabel,
    position: index,
    status: spec.status ?? "upcoming",
    scheduledAt: spec.scheduledAt ?? null,
    enteredAt: spec.enteredAt ?? null,
    completedAt: spec.completedAt ?? null,
    hasArtifacts: spec.hasArtifacts ?? false,
  }));
  return { status, currentStageId: stages[currentIndex].id, stages };
}
```

Stage ids are deterministic (`s0`, `s1`, ... matching each spec's array index), so a test table can reference `"s2"` directly without holding onto the returned state object. This has no dedicated test file: it is exercised by every case in Step 11 below, and its own logic is a straight field-by-field copy with defaults, the same reasoning as `expectOk`/`expectFail` in Step 4.

- [ ] **Step 10: Write `lib/pipeline/rules.ts`'s types**

Create `lib/pipeline/rules.ts`, starting with the type and constant definitions copied from the Interfaces block above (`StageState`, `OpportunityState`, `MoveTarget`, `NEW_STAGE`, `StagePatch`, `StageDraft`, `MovePlan`, `MoveError`, `EditError`), plus these imports:

```typescript
import type { StageKind } from "./kinds";
import { STAGE_KINDS } from "./kinds";
import type { StageStatus } from "./values";
import { type Result, ok, fail } from "@/lib/result";
```

- [ ] **Step 11: Write the failing rules tests**

Create `tests/unit/pipeline-rules.test.ts`. This is long; it is the contract every function in Step 12 has to satisfy, one `describe` per function, cases generated from an array the way Task 2's isolation matrix was.

```typescript
import { describe, expect, it } from "vitest";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";
import {
  NEW_STAGE,
  defaultStages,
  placementIndex,
  nextStageId,
  planMove,
  planAddStage,
  planReorder,
  planRename,
  planSkip,
  planUnskip,
  planRemove,
  type OpportunityState,
} from "@/lib/pipeline/rules";
import { buildState, type StageSpec } from "../helpers/pipeline-state";
import { expectOk, expectFail } from "../helpers/result";

const NOW = new Date("2026-09-19T12:00:00.000Z");
const PAST = new Date("2026-09-01T12:00:00.000Z");
const FUTURE = new Date("2026-10-01T12:00:00.000Z");

describe("defaultStages", () => {
  it("returns the seven kinds in board order with their default labels", () => {
    expect(defaultStages()).toEqual(STAGE_KINDS.map((k) => ({ kind: k.kind, label: k.defaultLabel })));
  });
});

describe("placementIndex", () => {
  const cases: { name: string; specs: StageSpec[]; kind: StageSpec["kind"]; expected: number }[] = [
    {
      name: "right after the one existing stage of the same kind",
      specs: [{ kind: "saved" }, { kind: "applied" }, { kind: "portfolio_case" }],
      kind: "portfolio_case",
      expected: 3,
    },
    {
      name: "right after the last of two existing stages of the same kind",
      specs: [{ kind: "saved" }, { kind: "applied" }, { kind: "portfolio_case" }, { kind: "portfolio_case" }],
      kind: "portfolio_case",
      expected: 4,
    },
    {
      name: "right after the last stage whose kind comes earlier, when none of the same kind exist",
      specs: [{ kind: "saved" }, { kind: "applied" }, { kind: "hiring_manager" }, { kind: "offer" }],
      kind: "portfolio_case",
      expected: 3,
    },
    {
      name: "index 0 when no stage has an earlier kind",
      specs: [{ kind: "portfolio_case" }],
      kind: "recruiter_screen",
      expected: 0,
    },
    {
      name: "never after Offer",
      specs: [{ kind: "saved" }, { kind: "applied" }, { kind: "offer" }],
      kind: "panel_final",
      expected: 2,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const { stages } = buildState(c.specs, 0);
      expect(placementIndex(stages, c.kind)).toBe(c.expected);
    });
  }
});

describe("nextStageId", () => {
  const cases: { name: string; specs: StageSpec[]; currentIndex: number; expected: string | null }[] = [
    {
      name: "the first later stage that is not skipped",
      specs: [{ kind: "saved", status: "done" }, { kind: "applied" }, { kind: "recruiter_screen" }],
      currentIndex: 1,
      expected: "s2",
    },
    {
      name: "skips over a skipped stage",
      specs: [
        { kind: "saved", status: "done" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "skipped" },
        { kind: "hiring_manager" },
      ],
      currentIndex: 1,
      expected: "s3",
    },
    {
      name: "null when the current stage is last",
      specs: [{ kind: "saved", status: "done" }, { kind: "applied" }],
      currentIndex: 1,
      expected: null,
    },
    {
      name: "null when every later stage is skipped",
      specs: [
        { kind: "saved", status: "done" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "skipped" },
        { kind: "hiring_manager", status: "skipped" },
      ],
      currentIndex: 1,
      expected: null,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const state = buildState(c.specs, c.currentIndex);
      expect(nextStageId(state)).toBe(c.expected);
    });
  }
});

describe("planMove", () => {
  it("forward by one", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "applied", enteredAt: PAST },
        { kind: "recruiter_screen" },
      ],
      1,
    );
    const plan = expectOk(planMove(state, { kind: "recruiter_screen" }, NOW));
    expect(plan).toEqual({
      create: null,
      order: null,
      patches: [
        { id: "s1", status: "done", completedAt: NOW },
        { id: "s2", enteredAt: NOW },
      ],
      currentStageId: "s2",
      from: { stageId: "s1", kind: "applied", label: "Applied" },
      to: { stageId: "s2", kind: "recruiter_screen", label: "Recruiter screen" },
    });
  });

  it("forward jump that skips two upcoming stages and leaves a scheduled one alone", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", enteredAt: PAST },
        { kind: "recruiter_screen" },
        { kind: "hiring_manager", status: "scheduled", scheduledAt: FUTURE },
        { kind: "portfolio_case" },
        { kind: "panel_final" },
      ],
      1,
    );
    const plan = expectOk(planMove(state, { kind: "panel_final" }, NOW));
    expect(plan.patches).toEqual([
      { id: "s1", status: "done", completedAt: NOW },
      { id: "s2", status: "skipped" },
      { id: "s4", status: "skipped" },
      { id: "s5", enteredAt: NOW },
    ]);
    expect(plan.currentStageId).toBe("s5");
  });

  it("backward by two with one future-dated stage", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "applied", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "recruiter_screen", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "hiring_manager", status: "scheduled", scheduledAt: FUTURE, enteredAt: PAST },
      ],
      3,
    );
    const plan = expectOk(planMove(state, { stageId: "s1" }, NOW));
    expect(plan.patches).toEqual([
      { id: "s2", status: "upcoming", completedAt: null },
      { id: "s3", status: "scheduled", completedAt: null },
      { id: "s1", status: "upcoming", completedAt: null },
    ]);
    expect(plan.currentStageId).toBe("s1");
    expect(plan.from).toEqual({ stageId: "s3", kind: "hiring_manager", label: "Hiring manager" });
  });

  it("kind target with two stages of that kind where the first is skipped", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", enteredAt: PAST },
        { kind: "portfolio_case", status: "skipped", label: "Portfolio review" },
        { kind: "portfolio_case", label: "Take-home" },
      ],
      1,
    );
    const plan = expectOk(planMove(state, { kind: "portfolio_case" }, NOW));
    expect(plan.currentStageId).toBe("s3");
    expect(plan.to).toEqual({ stageId: "s3", kind: "portfolio_case", label: "Take-home" });
    expect(plan.patches).toEqual([
      { id: "s1", status: "done", completedAt: NOW },
      { id: "s3", enteredAt: NOW },
    ]);
  });

  it("kind target where all stages of that kind are skipped resolves to the first of them", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", enteredAt: PAST },
        { kind: "portfolio_case", status: "skipped", label: "A" },
        { kind: "portfolio_case", status: "skipped", label: "B" },
      ],
      1,
    );
    const plan = expectOk(planMove(state, { kind: "portfolio_case" }, NOW));
    expect(plan.currentStageId).toBe("s2");
    expect(plan.to.label).toBe("A");
    expect(plan.patches).toEqual([
      { id: "s1", status: "done", completedAt: NOW },
      { id: "s2", status: "upcoming", completedAt: null, enteredAt: NOW },
    ]);
  });

  it("kind target with a missing stage is created and placed before Offer", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", status: "done" },
        { kind: "hiring_manager", enteredAt: PAST },
        { kind: "offer" },
      ],
      2,
    );
    const plan = expectOk(planMove(state, { kind: "portfolio_case" }, NOW));
    expect(plan.create).toEqual({ kind: "portfolio_case", label: "Portfolio review" });
    expect(plan.order).toEqual(["s0", "s1", "s2", NEW_STAGE, "s3"]);
    expect(plan.currentStageId).toBe(NEW_STAGE);
    expect(plan.patches).toEqual([
      { id: "s2", status: "done", completedAt: NOW },
      { id: NEW_STAGE, enteredAt: NOW },
    ]);
  });

  it("a missing kind placed at or before the current stage is created as a backward move", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", status: "done" },
        { kind: "hiring_manager", enteredAt: PAST },
        { kind: "offer" },
      ],
      2,
    );
    const plan = expectOk(planMove(state, { kind: "recruiter_screen" }, NOW));
    expect(plan.create).toEqual({ kind: "recruiter_screen", label: "Recruiter screen" });
    expect(plan.order).toEqual(["s0", "s1", NEW_STAGE, "s2", "s3"]);
    expect(plan.currentStageId).toBe(NEW_STAGE);
    expect(plan.patches).toEqual([
      { id: "s2", status: "upcoming", completedAt: null },
      { id: NEW_STAGE, enteredAt: NOW },
    ]);
    expect(plan.to).toEqual({ stageId: NEW_STAGE, kind: "recruiter_screen", label: "Recruiter screen" });
  });

  it("a skipped target with a future date becomes scheduled, not upcoming", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", enteredAt: PAST },
        { kind: "recruiter_screen", status: "skipped", scheduledAt: FUTURE },
      ],
      1,
    );
    const plan = expectOk(planMove(state, { kind: "recruiter_screen" }, NOW));
    expect(plan.patches).toEqual([
      { id: "s1", status: "done", completedAt: NOW },
      { id: "s2", status: "scheduled", completedAt: null, enteredAt: NOW },
    ]);
  });

  it("in a reordered job, a drop onto a column to the right can still be a backward move", () => {
    // Board-column order would put "Panel / final" to the right of
    // "Recruiter" (rank 5 vs rank 2), but this job's own stepper was
    // reordered so the panel_final stage sits earlier than recruiter_screen.
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", status: "done" },
        { kind: "panel_final", status: "done", enteredAt: PAST },
        { kind: "recruiter_screen", enteredAt: PAST },
        { kind: "hiring_manager" },
        { kind: "portfolio_case" },
        { kind: "offer" },
      ],
      3,
    );
    const plan = expectOk(planMove(state, { kind: "panel_final" }, NOW));
    expect(plan.currentStageId).toBe("s2");
    expect(plan.from).toEqual({ stageId: "s3", kind: "recruiter_screen", label: "Recruiter screen" });
    expect(plan.patches).toEqual([
      { id: "s3", status: "upcoming", completedAt: null },
      { id: "s2", status: "upcoming", completedAt: null },
    ]);
  });

  it("moving back onto a done stage returns it to upcoming", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "applied", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "recruiter_screen", enteredAt: PAST },
      ],
      2,
    );
    const plan = expectOk(planMove(state, { stageId: "s0" }, NOW));
    expect(plan.currentStageId).toBe("s0");
    expect(plan.patches).toEqual([
      { id: "s1", status: "upcoming", completedAt: null },
      { id: "s2", status: "upcoming", completedAt: null },
      { id: "s0", status: "upcoming", completedAt: null },
    ]);
  });

  it("keeps enteredAt on a second visit to a stage", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", enteredAt: PAST },
        { kind: "recruiter_screen", enteredAt: PAST },
      ],
      2,
    );
    const plan = expectOk(planMove(state, { kind: "applied" }, NOW));
    expect(plan.currentStageId).toBe("s1");
    // Only the old current stage (s2) is patched; s1 needed no field
    // changes (already upcoming, enteredAt already set), so it has no
    // patch entry at all.
    expect(plan.patches).toEqual([{ id: "s2", status: "upcoming", completedAt: null }]);
  });

  it("rejects a move on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1, "closed");
    expectFail(planMove(state, { kind: "recruiter_screen" }, NOW), "closed");
  });

  it("rejects a stageId target equal to the current stage", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planMove(state, { stageId: "s1" }, NOW), "same_stage");
  });

  it("rejects a kind target equal to the current stage's kind, even with another stage of that kind", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "portfolio_case" }, { kind: "portfolio_case" }],
      1,
    );
    expectFail(planMove(state, { kind: "portfolio_case" }, NOW), "same_column");
  });

  it("rejects an unknown stageId target", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planMove(state, { stageId: "does-not-exist" }, NOW), "not_found");
  });
});

describe("planAddStage", () => {
  const openState = (): OpportunityState =>
    buildState([{ kind: "saved" }, { kind: "applied" }, { kind: "offer" }], 1);

  it("rejects on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }, { kind: "offer" }], 1, "closed");
    expectFail(planAddStage(state, "portfolio_case", "Take-home"), "closed");
  });

  for (const kind of ["saved", "applied", "offer"] as const) {
    it(`rejects adding another ${kind} stage`, () => {
      expectFail(planAddStage(openState(), kind, "Extra"), "fixed_stage");
    });
  }

  it("rejects a blank label", () => {
    expectFail(planAddStage(openState(), "portfolio_case", "   "), "label_required");
  });

  it("places a brand new kind right after the last earlier-kind stage", () => {
    const result = expectOk(planAddStage(openState(), "portfolio_case", "Take-home"));
    expect(result.create).toEqual({ kind: "portfolio_case", label: "Take-home" });
    expect(result.order).toEqual(["s0", "s1", NEW_STAGE, "s2"]);
  });

  it("places a second stage of an existing kind right after the first", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "applied" }, { kind: "portfolio_case" }, { kind: "offer" }],
      1,
    );
    const result = expectOk(planAddStage(state, "portfolio_case", "Take-home"));
    expect(result.order).toEqual(["s0", "s1", "s2", NEW_STAGE, "s3"]);
  });
});

describe("planReorder", () => {
  const fiveStages = () =>
    buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen" },
        { kind: "hiring_manager" },
        { kind: "offer" },
      ],
      1,
    );

  it("rejects on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }, { kind: "offer" }], 1, "closed");
    expectFail(planReorder(state, ["s0", "s1", "s2"]), "closed");
  });

  it("rejects an order missing an id", () => {
    expectFail(planReorder(fiveStages(), ["s0", "s1", "s2", "s3"]), "invalid_order");
  });

  it("rejects an order with an unknown id", () => {
    expectFail(planReorder(fiveStages(), ["s0", "s1", "s2", "s3", "bogus"]), "invalid_order");
  });

  it("rejects an order with a duplicate id", () => {
    expectFail(planReorder(fiveStages(), ["s0", "s1", "s1", "s3", "s4"]), "invalid_order");
  });

  it("rejects an order that does not start with Saved", () => {
    expectFail(planReorder(fiveStages(), ["s1", "s0", "s2", "s3", "s4"]), "invalid_order");
  });

  it("rejects an order whose second stage is not Applied", () => {
    expectFail(planReorder(fiveStages(), ["s0", "s2", "s1", "s3", "s4"]), "invalid_order");
  });

  it("rejects an order that does not end with Offer", () => {
    expectFail(planReorder(fiveStages(), ["s0", "s1", "s4", "s3", "s2"]), "invalid_order");
  });

  it("accepts a permutation that keeps Saved first, Applied second and Offer last", () => {
    const order = ["s0", "s1", "s3", "s2", "s4"];
    const result = expectOk(planReorder(fiveStages(), order));
    expect(result.order).toEqual(order);
  });
});

describe("planRename", () => {
  it("rejects on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1, "closed");
    expectFail(planRename(state, "s0", "New label"), "closed");
  });

  it("rejects an unknown stageId", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planRename(state, "bogus", "New label"), "not_found");
  });

  it("rejects a blank label", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planRename(state, "s1", "  "), "label_required");
  });

  it("allows renaming a fixed stage (Saved, Applied and Offer are not exempt from rename)", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    const patch = expectOk(planRename(state, "s0", "Long-listed"));
    expect(patch).toEqual({ id: "s0", label: "Long-listed" });
  });
});

describe("planSkip", () => {
  it("rejects on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1, "closed");
    expectFail(planSkip(state, "s0"), "closed");
  });

  it("rejects an unknown stageId", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planSkip(state, "bogus"), "not_found");
  });

  it("rejects skipping the current stage", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planSkip(state, "s1"), "stage_current");
  });

  it("rejects skipping a done stage", () => {
    const state = buildState([{ kind: "saved", status: "done" }, { kind: "applied" }], 1);
    expectFail(planSkip(state, "s0"), "not_skippable");
  });

  it("rejects skipping an already-skipped stage", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "applied" }, { kind: "recruiter_screen", status: "skipped" }],
      1,
    );
    expectFail(planSkip(state, "s2"), "not_skippable");
  });

  it("allows skipping an upcoming, non-current stage", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "applied" }, { kind: "recruiter_screen" }],
      1,
    );
    expect(expectOk(planSkip(state, "s2"))).toEqual({ id: "s2", status: "skipped" });
  });

  it("allows skipping a scheduled, non-current stage", () => {
    const state = buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "scheduled", scheduledAt: FUTURE },
      ],
      1,
    );
    expect(expectOk(planSkip(state, "s2"))).toEqual({ id: "s2", status: "skipped" });
  });
});

describe("planUnskip", () => {
  it("rejects on a closed opportunity", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "applied", status: "skipped" }],
      0,
      "closed",
    );
    expectFail(planUnskip(state, "s1", NOW), "closed");
  });

  it("rejects an unknown stageId", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planUnskip(state, "bogus", NOW), "not_found");
  });

  it("rejects a stage that is not skipped", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planUnskip(state, "s0", NOW), "not_skipped");
  });

  it("returns to upcoming when there is no scheduled date", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "applied" }, { kind: "recruiter_screen", status: "skipped" }],
      1,
    );
    expect(expectOk(planUnskip(state, "s2", NOW))).toEqual({ id: "s2", status: "upcoming" });
  });

  it("returns to scheduled when the scheduled date is in the future", () => {
    const state = buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "skipped", scheduledAt: FUTURE },
      ],
      1,
    );
    expect(expectOk(planUnskip(state, "s2", NOW))).toEqual({ id: "s2", status: "scheduled" });
  });

  it("returns to upcoming when the scheduled date is in the past", () => {
    const state = buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "skipped", scheduledAt: PAST },
      ],
      1,
    );
    expect(expectOk(planUnskip(state, "s2", NOW))).toEqual({ id: "s2", status: "upcoming" });
  });
});

describe("planRemove", () => {
  const openState = () =>
    buildState(
      [{ kind: "saved" }, { kind: "applied" }, { kind: "recruiter_screen" }, { kind: "offer" }],
      1,
    );

  it("rejects on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1, "closed");
    expectFail(planRemove(state, "s0"), "closed");
  });

  it("rejects an unknown stageId", () => {
    expectFail(planRemove(openState(), "bogus"), "not_found");
  });

  for (const [label, id] of [
    ["Saved", "s0"],
    ["Applied", "s1"],
    ["Offer", "s3"],
  ] as const) {
    it(`rejects removing ${label}`, () => {
      expectFail(planRemove(openState(), id), "fixed_stage");
    });
  }

  it("rejects removing the current stage", () => {
    expectFail(planRemove(openState(), "s1"), "stage_current");
  });

  it("rejects removing a done stage", () => {
    const state = buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "done" },
        { kind: "offer" },
      ],
      1,
    );
    expectFail(planRemove(state, "s2"), "stage_done");
  });

  it("rejects removing a stage with artifacts", () => {
    const state = buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen", hasArtifacts: true },
        { kind: "offer" },
      ],
      1,
    );
    expectFail(planRemove(state, "s2"), "stage_has_artifacts");
  });

  it("removes a flexible, non-current, non-done stage with no artifacts", () => {
    const result = expectOk(planRemove(openState(), "s2"));
    expect(result.order).toEqual(["s0", "s1", "s3"]);
  });
});
```

- [ ] **Step 12: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/pipeline-rules.test.ts
```

Expected: it fails, either because the module is missing or because it does not yet export these functions.

- [ ] **Step 13: Implement `lib/pipeline/rules.ts`**

Write the type definitions from Step 10, then each function below. Every function first checks `state.status === "closed"` and returns `fail("closed", ...)` before anything else, except `defaultStages`, `placementIndex` and `nextStageId`, which take no `OpportunityState` (or, for `nextStageId`, do not need the closed check because it has no failure return at all).

`defaultStages(): StageDraft[]`
1. Map `STAGE_KINDS` to `{ kind: k.kind, label: k.defaultLabel }`, in order. No failure case.

`placementIndex(stages: StageState[], kind: StageKind): number`
1. Find the highest array index in `stages` whose `kind` equals the target `kind`. If found, return that index plus 1 (rule 4, "right after the last stage of the same kind").
2. Otherwise, find the highest array index in `stages` whose kind's rank in `STAGE_KINDS` (its index in that array) is less than the target kind's own rank. If found, return that index plus 1 (rule 4, "right after the last stage whose kind comes earlier").
3. Otherwise return 0. Edge case: because `STAGE_KINDS` never has an entry ranked higher than Offer, and Offer's own rank can never be "less than" any other kind's rank, step 2 can never select Offer, so "never after Offer" (rule 4) falls out of the rank comparison and needs no special case, as long as step 2 compares by rank and not by array position or by `position` field.

`nextStageId(state: OpportunityState): string | null`
1. Find `state.currentStageId`'s index in `state.stages`.
2. Scan forward from the next index; return the `id` of the first stage whose `status !== "skipped"`.
3. If none, return `null`. No failure case (not wrapped in `Result`).

`planMove(state, target, now): Result<MovePlan, MoveError>`
1. Rule 1: closed opportunity, `fail("closed")`.
2. Resolve `target` to a stage index in `state.stages` (already position-sorted), or to a not-yet-created stage:
   - `{ stageId }`: equal to `state.currentStageId` is `fail("same_stage")` (rule 2). Otherwise find it in `state.stages`; not found is `fail("not_found")` (rule 2). `create = null`.
   - `{ kind }`: equal to the current stage's own kind is `fail("same_column")` even if another stage of that kind exists elsewhere (rule 2). Otherwise collect every stage of that kind; if any is not `"skipped"`, take the first such one by position (rule 3); if all are skipped, take the first of them by position (rule 3); if none exist, this is a create: `create = { kind, label: STAGE_KINDS entry's defaultLabel }`, and the stage's position for the next step is `placementIndex(state.stages, kind)` (rule 3, rule 4).
3. Direction (rule 5, "decided by position, never by kind order"): let `currentIndex` be the current stage's array index and `targetIndex` be the resolved stage's array index (or the `placementIndex` result when `create` is set). `targetIndex > currentIndex` is forward, otherwise backward. (For a `create`, `targetIndex <= currentIndex` is backward because inserting at that array index pushes the current stage, and everything after it, one slot later.)
4. Forward: patch the old current stage to `{ status: "done", completedAt: now }`. For every stage strictly between the old current and the target (exclusive both ends) whose `status === "upcoming"`, patch it to `{ status: "skipped" }`; a stage in that range with any other status (including `"scheduled"`) is left untouched (rule 5).
5. Backward: for every stage from just after the target up to and including the old current stage (inclusive), patch it to `{ status: "upcoming", completedAt: null }`, or `{ status: "scheduled", completedAt: null }` when that stage's own `scheduledAt` is later than `now` (rule 5). This always includes the old current stage itself, even when its own status does not textually change. When the target is a newly created stage, take this range from the OLD array indices, from the `placementIndex` result through the current stage's index, inclusive; after the insert, these are the stages that sit after the new stage, up to and including the old current stage.
6. Target becomes current (rule 6): if the target's status is `"done"` or `"skipped"`, patch it to `{ status: "upcoming", completedAt: null }`, or `{ status: "scheduled", completedAt: null }` when it has a future `scheduledAt`. Separately, if the target's `enteredAt` is `null`, add `enteredAt: now` to its patch. If the target is a `create`, it has no existing status/enteredAt to check: just add `{ id: NEW_STAGE, enteredAt: now }` (a newly inserted stage is never done or skipped). If an existing target needs neither a status change nor an `enteredAt` change, it gets no patch entry at all (the "kept on a second visit" test relies on this). The `patches` array's order matters, since the tests compare it with `toEqual`: a forward move emits the old current stage's patch first, then any in-between stages in ascending position order, then the target's patch last; a backward move emits the range stages in ascending position order, then the target's patch last; a target that needs no change contributes no entry.
7. `order`: only set when `create` is set, built from `state.stages` ids in position order with `NEW_STAGE` spliced in at the `placementIndex` result; `null` otherwise.
8. `currentStageId`: the resolved stage's id, or `NEW_STAGE`.
9. `from`/`to`: `{ stageId, kind, label }` for the old current stage and the resolved target (using `create.label`/`create.kind` and `NEW_STAGE` for a created stage).
10. Return `ok({ create, order, patches, currentStageId, from, to })`.
- Error codes: `closed` (state is closed), `not_found` (`{ stageId }` does not match any stage), `same_stage` (`{ stageId }` equals the current stage), `same_column` (`{ kind }` equals the current stage's kind).

`planAddStage(state, kind, label): Result<{ create: StageDraft; order }, EditError>`
1. Rule 1: closed, `fail("closed")`.
2. Rule 7: `kind` is `"saved"`, `"applied"` or `"offer"`, `fail("fixed_stage")`.
3. Rule 7: `label.trim()` is empty, `fail("label_required")`.
4. `idx = placementIndex(state.stages, kind)`.
5. `order` = `state.stages` ids in position order with `NEW_STAGE` spliced in at `idx`.
6. Return `ok({ create: { kind, label: label.trim() }, order })`.
- Error codes: `closed`, `fixed_stage`, `label_required`.

`planReorder(state, orderedIds): Result<{ order: string[] }, EditError>`
1. Rule 1: closed, `fail("closed")`.
2. Rule 8: `orderedIds` must be exactly a permutation of `state.stages.map(s => s.id)` (same length, no duplicates, no id outside the set); otherwise `fail("invalid_order")`.
3. Rule 8: the stage at `orderedIds[0]` must have kind `"saved"`, the one at `orderedIds[1]` must have kind `"applied"`, the last one must have kind `"offer"`; any mismatch is `fail("invalid_order")`.
4. Return `ok({ order: orderedIds })`.
- Error codes: `closed`, `invalid_order`.

`planRename(state, stageId, label): Result<StagePatch, EditError>`
1. Rule 1: closed, `fail("closed")`.
2. `stageId` not found in `state.stages`, `fail("not_found")`.
3. `label.trim()` empty, `fail("label_required")`.
4. Return `ok({ id: stageId, label: label.trim() })`. Edge case: this applies to every stage including Saved, Applied and Offer; spec 5.1 says any stage can be renamed, and `fixed_stage` in `planRename` never fires (it exists in `EditError` only because the same union covers add and remove).
- Error codes: `closed`, `not_found`, `label_required`.

`planSkip(state, stageId): Result<StagePatch, EditError>`
1. Rule 1: closed, `fail("closed")`.
2. `stageId` not found, `fail("not_found")`.
3. Rule 10: `stageId === state.currentStageId`, `fail("stage_current")`.
4. Rule 10: the stage's `status` is not `"upcoming"` and not `"scheduled"`, `fail("not_skippable")` (this also covers an already-skipped or a done stage).
5. Return `ok({ id: stageId, status: "skipped" })`.
- Error codes: `closed`, `not_found`, `stage_current`, `not_skippable`.

`planUnskip(state, stageId, now): Result<StagePatch, EditError>`
1. Rule 1: closed, `fail("closed")`.
2. `stageId` not found, `fail("not_found")`.
3. Rule 10/D15: the stage's `status !== "skipped"`, `fail("not_skipped")`.
4. D15: new status is `"scheduled"` when the stage's own `scheduledAt` is later than `now`, otherwise `"upcoming"` (rule 6's same sub-rule, reused).
5. Return `ok({ id: stageId, status: newStatus })`.
- Error codes: `closed`, `not_found`, `not_skipped`.

`planRemove(state, stageId): Result<{ order: string[] }, EditError>`
1. Rule 1: closed, `fail("closed")`.
2. `stageId` not found, `fail("not_found")`.
3. Rule 9: the stage's kind is `"saved"`, `"applied"` or `"offer"`, `fail("fixed_stage")`.
4. Rule 9: `stageId === state.currentStageId`, `fail("stage_current")`.
5. Rule 9: the stage's `status === "done"`, `fail("stage_done")`.
6. Rule 9: the stage's `hasArtifacts === true`, `fail("stage_has_artifacts")` (always `false` in this milestone; the check exists so Milestone 3 only has to supply real data).
7. `order` = ids of every other stage, in position order.
8. Return `ok({ order })`.
- Error codes: `closed`, `not_found`, `fixed_stage`, `stage_current`, `stage_done`, `stage_has_artifacts`.

- [ ] **Step 14: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/pipeline-rules.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 66 passed (66)` (1 `defaultStages` + 5 `placementIndex` + 4 `nextStageId` + 15 `planMove` + 7 `planAddStage` + 8 `planReorder` + 4 `planRename` + 7 `planSkip` + 6 `planUnskip` + 9 `planRemove`).

- [ ] **Step 15: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0.

- [ ] **Step 16: Commit**

```bash
git add lib/result.ts lib/companies/name-key.ts lib/pipeline/slug.ts lib/pipeline/rules.ts tests/unit/result.test.ts tests/unit/name-key.test.ts tests/unit/slug.test.ts tests/unit/pipeline-rules.test.ts tests/helpers/result.ts tests/helpers/pipeline-state.ts
git commit -m "$(cat <<'EOF'
feat: add Result, company name key, slug helpers and pure pipeline rules

EOF
)"
```

---

### Task 4: Pipeline persistence

**Files:**
- Create: `lib/pipeline/create.ts`, `lib/pipeline/create-schema.ts`, `lib/pipeline/move.ts`, `lib/pipeline/close.ts`, `lib/pipeline/stages.ts`, `lib/pipeline/snapshot.ts`
- Test: `tests/integration/pipeline-create.test.ts`, `tests/integration/pipeline-move.test.ts`, `tests/integration/pipeline-close.test.ts`, `tests/integration/pipeline-stages.test.ts`
- Test helper, created: `tests/helpers/opportunity-fixture.ts`

**Interfaces:**
- Consumes: `Scoped` and every `scoped().company`/`opportunity`/`stage`/`event` method (Task 2). `Result`, `ok`, `fail` from `lib/result.ts` (Task 3). `companyNameKey` (Task 3). `baseSlug`, `uniqueSlug` (Task 3). `defaultStages`, `planMove`, `planAddStage`, `planReorder`, `planRename`, `planSkip`, `planUnskip`, `planRemove`, `NEW_STAGE`, `OpportunityState`, `StageState`, `MoveTarget`, `MoveError`, `EditError` from `lib/pipeline/rules.ts` (Task 3). `StageKind` from `lib/pipeline/kinds.ts`. `WorkMode`, `OpportunitySource`, `OpportunityStatus`, `ClosedReason` from `lib/pipeline/values.ts` (Task 1). `makeTestDb`, `createTestUser` from `tests/helpers/db.ts`. `expectOk`, `expectFail` from `tests/helpers/result.ts` (Task 3).
- Produces (copied from the frame character for character):

```typescript
// lib/pipeline/create.ts
export type CreateOpportunityInput = {
  companyName: string; roleTitle: string; location?: string; workMode?: WorkMode; sourceUrl?: string;
  postingText?: string; compMin?: number; compMax?: number; compCurrency?: string; compNote?: string; myAsk?: string;
  source?: OpportunitySource;
};
export function createOpportunity(s: Scoped, input: CreateOpportunityInput, now?: Date): Promise<Result<{ id: string; slug: string }, "invalid" | "duplicate">>;
// lib/pipeline/move.ts
export function moveOpportunity(s: Scoped, opportunityId: string, target: MoveTarget, now?: Date): Promise<Result<{ from: { kind: StageKind; label: string }; to: { stageId: string; kind: StageKind; label: string } }, MoveError>>;
// lib/pipeline/close.ts
export function closeOpportunity(s: Scoped, opportunityId: string, reason: ClosedReason, now?: Date): Promise<Result<null, "not_found" | "closed">>;
export function reopenOpportunity(s: Scoped, opportunityId: string, now?: Date): Promise<Result<null, "not_found" | "not_closed">>;
// lib/pipeline/stages.ts
export function addStage(s: Scoped, opportunityId: string, kind: StageKind, label: string): Promise<Result<{ stageId: string }, EditError>>;
export function renameStage(s: Scoped, opportunityId: string, stageId: string, label: string): Promise<Result<null, EditError>>;
export function reorderStages(s: Scoped, opportunityId: string, orderedIds: string[]): Promise<Result<null, EditError>>;
export function skipStage(s: Scoped, opportunityId: string, stageId: string): Promise<Result<null, EditError>>;
export function unskipStage(s: Scoped, opportunityId: string, stageId: string, now?: Date): Promise<Result<null, EditError>>;
export function removeStage(s: Scoped, opportunityId: string, stageId: string): Promise<Result<null, EditError>>;
// lib/pipeline/snapshot.ts
export function loadState(s: Scoped, opportunityId: string): Promise<{ opportunity: OpportunityRow; state: OpportunityState } | null>;

// lib/pipeline/create-schema.ts (new; the frame's Task 8 reuses this file, it does not redefine it)
export const createOpportunitySchema: ZodType;

// tests/helpers/opportunity-fixture.ts
export const FIXTURE_NOW: Date;
export function seedOpportunity(s: Scoped, overrides?: Partial<CreateOpportunityInput>, now?: Date): Promise<{ id: string; slug: string }>;
export function stageIdsByKind(s: Scoped, opportunityId: string): Promise<Record<string, string>>;
```

`lib/pipeline/create-schema.ts` is not named in the frame's Task 4 section, only in Task 8's ("the Zod schema shared by the action and the import"). `createOpportunity` needs Zod validation now (this task), and Task 8 and Task 12 (both later) reuse whatever this task creates rather than each writing their own, so this file has to exist starting here. This is the one place this task adds something the frame did not explicitly list under Task 4; report it as a frame gap closed, not a deviation from a stated decision.

- [ ] **Step 1: Write the create-input Zod schema in full**

Create `lib/pipeline/create-schema.ts`:

```typescript
import { z } from "zod";
import { WORK_MODES, OPPORTUNITY_SOURCES } from "@/lib/pipeline/values";

export const createOpportunitySchema = z
  .object({
    companyName: z.string().trim().min(1),
    roleTitle: z.string().trim().min(1),
    location: z.string().trim().min(1).optional(),
    workMode: z.enum(WORK_MODES).optional(),
    sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
    postingText: z.string().optional(),
    compMin: z.number().int().nonnegative().optional(),
    compMax: z.number().int().nonnegative().optional(),
    compCurrency: z.string().trim().min(1).optional(),
    compNote: z.string().optional(),
    myAsk: z.string().optional(),
    source: z.enum(OPPORTUNITY_SOURCES).optional(),
  })
  .refine((v) => v.compMin === undefined || v.compMax === undefined || v.compMin <= v.compMax, {
    message: "compMin must be less than or equal to compMax",
    path: ["compMax"],
  });
```

Verified in a planning scratch file (`zod-spike.ts`, not kept in the repo) and a planning scratch file (`zod-runtime-spike.ts`, not kept in the repo): `z.url({ protocol: /^https?$/ })` accepts `https://acme.example/careers/1`, rejects `ftp://...` and `javascript:...`; `.trim().min(1)` rejects a whitespace-only string; the cross-field `.refine` fires only when both `compMin` and `compMax` are present and out of order.

- [ ] **Step 2: Write the opportunity test fixture helper**

Create `tests/helpers/opportunity-fixture.ts`:

```typescript
import type { Scoped } from "@/lib/db/scoped";
import { createOpportunity, type CreateOpportunityInput } from "@/lib/pipeline/create";

export const FIXTURE_NOW = new Date("2026-09-19T12:00:00.000Z");

export async function seedOpportunity(
  s: Scoped,
  overrides: Partial<CreateOpportunityInput> = {},
  now: Date = FIXTURE_NOW,
): Promise<{ id: string; slug: string }> {
  const result = await createOpportunity(
    s,
    { companyName: "Acme Robotics", roleTitle: "Product Designer", ...overrides },
    now,
  );
  if (!result.ok) {
    throw new Error(`seedOpportunity failed: ${result.code}: ${result.message}`);
  }
  return result.data;
}

export async function stageIdsByKind(s: Scoped, opportunityId: string): Promise<Record<string, string>> {
  const stages = await s.stage.listForOpportunity(opportunityId);
  const map: Record<string, string> = {};
  for (const stage of stages) {
    map[stage.kind] = stage.id;
  }
  return map;
}
```

This has no dedicated test file: `seedOpportunity` is exercised by every other test in this task (including `createOpportunity`'s own tests, which call it through `createOpportunity` directly rather than through this wrapper the first time, so the function under test is still exercised without indirection), and `stageIdsByKind` is a plain lookup with no branch to get wrong.

- [ ] **Step 3: Write the failing `createOpportunity` tests**

Create `tests/integration/pipeline-create.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { expectOk, expectFail } from "../helpers/result";

const NOW = new Date("2026-09-19T12:00:00.000Z");

describe("createOpportunity", () => {
  it("creates seven default stages with Saved current and writes one created event", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const created = expectOk(
        await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );

      const stages = await s.stage.listForOpportunity(created.id);
      expect(stages.map((st) => st.kind)).toEqual([
        "saved",
        "applied",
        "recruiter_screen",
        "hiring_manager",
        "portfolio_case",
        "panel_final",
        "offer",
      ]);
      expect(stages.map((st) => st.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);

      const opportunity = await s.opportunity.getById(created.id);
      const savedStage = stages.find((st) => st.kind === "saved")!;
      expect(opportunity?.currentStageId).toBe(savedStage.id);
      expect(savedStage.enteredAt).toEqual(NOW);

      const events = await s.event.listForOpportunity(created.id);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("created");
    } finally {
      await close();
    }
  });

  it("gives the second job with the same company and role a unique slug", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const first = expectOk(
        await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );
      await s.opportunity.update(first.id, { status: "closed", closedReason: "withdrawn", closedAt: NOW });
      const second = expectOk(
        await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );
      expect(second.slug).not.toBe(first.slug);
      expect(second.slug.startsWith(first.slug)).toBe(true);
    } finally {
      await close();
    }
  });

  it("rejects a duplicate company and role while the first is still active", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW);
      const second = await createOpportunity(
        s,
        { companyName: "Acme Robotics", roleTitle: "Product Designer" },
        NOW,
      );
      expectFail(second, "duplicate");
    } finally {
      await close();
    }
  });

  it("allows a repeat application once the first is closed", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const first = expectOk(
        await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );
      await s.opportunity.update(first.id, { status: "closed", closedReason: "rejected", closedAt: NOW });
      const second = await createOpportunity(
        s,
        { companyName: "Acme Robotics", roleTitle: "Product Designer" },
        NOW,
      );
      expect(second.ok).toBe(true);
    } finally {
      await close();
    }
  });

  it("rejects invalid input", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner5@example.com");
      const s = scoped(db, user.id);
      expectFail(await createOpportunity(s, { companyName: "  ", roleTitle: "Designer" }, NOW), "invalid");
      expectFail(
        await createOpportunity(
          s,
          { companyName: "Acme", roleTitle: "Designer", compMin: 200000, compMax: 100000 },
          NOW,
        ),
        "invalid",
      );
      expectFail(
        await createOpportunity(
          s,
          { companyName: "Acme", roleTitle: "Designer", sourceUrl: "ftp://acme.example" },
          NOW,
        ),
        "invalid",
      );
    } finally {
      await close();
    }
  });

  it("keeps two users' companies and opportunities from colliding", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const aliceCreated = expectOk(
        await createOpportunity(a, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );
      expect(await b.opportunity.getBySlug(aliceCreated.slug)).toBeNull();
      const bobCreated = expectOk(
        await createOpportunity(b, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );
      expect(bobCreated.id).not.toBe(aliceCreated.id);
    } finally {
      await close();
    }
  });

  it("does not let underscore or percent in a role title act as a wildcard, but still matches case-insensitively", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner6@example.com");
      const s = scoped(db, user.id);
      await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "UX-UI Designer" }, NOW);
      const notAWildcardMatch = await createOpportunity(
        s,
        { companyName: "Acme Robotics", roleTitle: "UX_UI Designer" },
        NOW,
      );
      expect(notAWildcardMatch.ok).toBe(true);

      await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Product Designer" }, NOW);
      const caseInsensitiveMatch = await createOpportunity(
        s,
        { companyName: "Northwind Labs", roleTitle: "product designer" },
        NOW,
      );
      expectFail(caseInsensitiveMatch, "duplicate");
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/pipeline-create.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/create'`.

- [ ] **Step 5: Implement `lib/pipeline/snapshot.ts`'s `loadState`**

`loadState(s: Scoped, opportunityId: string): Promise<{ opportunity: OpportunityRow; state: OpportunityState } | null>`
1. `row = await s.opportunity.lockById(opportunityId)`. `null` in, `null` out. Callers always call this with a transaction-scoped `s` (D5), so the `FOR UPDATE` lock has real effect; called with the top-level `scopedFor(userId)` it would just be an ordinary read.
2. `rows = await s.stage.listForOpportunity(opportunityId)` (already position-sorted, per that method's contract from Task 2).
3. Map each row to a `StageState`: `{ id, kind: row.kind as StageKind, label, position, status: row.status as StageStatus, scheduledAt, enteredAt, completedAt, hasArtifacts: false }`. `hasArtifacts` is always `false` in this milestone (frame, rule 9's note); Milestone 3 is the one that starts supplying real data for it.
4. `state: OpportunityState = { status: row.status as OpportunityStatus, currentStageId: row.currentStageId!, stages }`. The non-null assertion is safe here: every opportunity gets a `currentStageId` at creation (Step 7 below) and it is never cleared afterward; the column is nullable only because of the circular-pointer FK mechanics (D2), not because a real opportunity can lack one.
5. Return `{ opportunity: row, state }`.

- [ ] **Step 6: Write `createOpportunity`'s algorithm**

`createOpportunity(s: Scoped, input: CreateOpportunityInput, now?: Date): Promise<Result<{ id: string; slug: string }, "invalid" | "duplicate">>`
1. Validate `input` with `createOpportunitySchema.safeParse`; on failure, `fail("invalid", <first issue's message>)`.
2. `resolvedNow = now ?? new Date()`.
3. `key = companyNameKey(input.companyName)`.
4. Run the rest inside `s.transaction(async (tx) => { ... })`.
5. `company = await tx.company.findByNameKey(key)`; if `null`, `company = await tx.company.insert({ name: input.companyName.trim(), nameKey: key, tracked: false })`.
6. `existing = await tx.opportunity.findByCompanyAndRole(company.id, input.roleTitle.trim())`; if it exists and `existing.status === "active"`, return `fail("duplicate", ...)` from inside the transaction (this commits whatever ran before it, which at most is the company lookup or insert above, never a partial opportunity, so nothing is left half-written).
7. `taken = await tx.opportunity.listSlugsWithPrefix(baseSlug(company.name, input.roleTitle.trim()))`; `slug = uniqueSlug(base, taken)`.
8. `opportunity = await tx.opportunity.insert({ companyId: company.id, slug, roleTitle: input.roleTitle.trim(), location: input.location?.trim(), workMode: input.workMode, source: input.source ?? "manual", sourceUrl: input.sourceUrl, postingMd: input.postingText ?? null, postingCapturedAt: input.postingText ? resolvedNow : null, compMin: input.compMin, compMax: input.compMax, compCurrency: input.compCurrency, compNote: input.compNote, myAsk: input.myAsk, currentStageId: null })`.
9. `drafts = defaultStages()`; `stageRows = await tx.stage.insertMany(drafts.map((d, i) => ({ opportunityId: opportunity.id, kind: d.kind, label: d.label, position: i })))`.
10. `savedStage = stageRows.find((r) => r.kind === "saved")!` (position 0 by construction).
11. `await tx.stage.update(savedStage.id, { enteredAt: resolvedNow })`.
12. `await tx.opportunity.update(opportunity.id, { currentStageId: savedStage.id })`.
13. `await tx.event.insert({ opportunityId: opportunity.id, kind: "created", occurredAt: resolvedNow, meta: {} })`.
14. Return `ok({ id: opportunity.id, slug: opportunity.slug })`.
- Edge cases: `findByCompanyAndRole` is case-insensitive (Task 2), so `"Product Designer"` and `"product designer"` collide for the duplicate check. A company can exist with multiple *closed* opportunities for the same role; only an *active* one blocks a new one.
- Error codes: `invalid` (schema rejects the input), `duplicate` (an active opportunity already exists for this company and role).

- [ ] **Step 7: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/integration/pipeline-create.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 7 passed (7)`.

- [ ] **Step 8: Write the failing `moveOpportunity` tests**

Create `tests/integration/pipeline-move.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, stageIdsByKind, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import { moveOpportunity } from "@/lib/pipeline/move";
import { expectOk, expectFail } from "../helpers/result";

describe("moveOpportunity", () => {
  it("moves forward, writes exactly one event, and keeps positions 0..n with no gaps", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const before = await s.event.listForOpportunity(id);

      const moved = expectOk(await moveOpportunity(s, id, { kind: "applied" }, FIXTURE_NOW));
      expect(moved.to.kind).toBe("applied");

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].kind).toBe("stage_moved");

      const opportunity = await s.opportunity.getById(id);
      const stages = await s.stage.listForOpportunity(id);
      const applied = stages.find((st) => st.kind === "applied")!;
      expect(opportunity?.currentStageId).toBe(applied.id);
      expect(stages.map((st) => st.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    } finally {
      await close();
    }
  });

  it("moves backward and returns skipped stages between to upcoming", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await moveOpportunity(s, id, { kind: "hiring_manager" }, FIXTURE_NOW);

      const before = await s.event.listForOpportunity(id);
      const moved = expectOk(await moveOpportunity(s, id, { kind: "applied" }, FIXTURE_NOW));
      expect(moved.to.kind).toBe("applied");
      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);

      const stages = await s.stage.listForOpportunity(id);
      const recruiterScreen = stages.find((st) => st.kind === "recruiter_screen")!;
      expect(recruiterScreen.status).toBe("upcoming");
    } finally {
      await close();
    }
  });

  it("moves to a missing kind, creating the stage before Offer with no position gaps", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await moveOpportunity(s, id, { kind: "hiring_manager" }, FIXTURE_NOW);
      const before = await s.stage.listForOpportunity(id);
      expect(before).toHaveLength(7);

      // Remove portfolio_case and panel_final directly through the Task 2
      // primitive (not the pipeline-level removeStage, which this task also
      // defines but in a different file: using it here would make this
      // test's own failing run, in Step 9, depend on that file existing
      // too). This leaves gaps in `position`, which is fine: planMove and
      // stage.renumber both work off array order, not raw position values,
      // and the move below ends by renumbering the whole opportunity anyway.
      const byKind = await stageIdsByKind(s, id);
      await s.stage.remove(byKind.panel_final);
      await s.stage.remove(byKind.portfolio_case);

      const beforeMove = await s.event.listForOpportunity(id);
      const moved = expectOk(await moveOpportunity(s, id, { kind: "portfolio_case" }, FIXTURE_NOW));
      expect(moved.to.kind).toBe("portfolio_case");
      const afterMove = await s.event.listForOpportunity(id);
      expect(afterMove).toHaveLength(beforeMove.length + 1);

      const stages = await s.stage.listForOpportunity(id);
      expect(stages).toHaveLength(6);
      expect(stages.map((st) => st.kind)).toEqual([
        "saved",
        "applied",
        "recruiter_screen",
        "hiring_manager",
        "portfolio_case",
        "offer",
      ]);
      expect(stages.map((st) => st.position)).toEqual([0, 1, 2, 3, 4, 5]);
    } finally {
      await close();
    }
  });

  it("rejects a move on a closed opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await s.opportunity.update(id, { status: "closed", closedReason: "withdrawn", closedAt: FIXTURE_NOW });
      expectFail(await moveOpportunity(s, id, { kind: "applied" }, FIXTURE_NOW), "closed");
    } finally {
      await close();
    }
  });

  it("rejects same_stage, same_column and not_found the same way the rules do", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner5@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectFail(await moveOpportunity(s, id, { stageId: byKind.saved }, FIXTURE_NOW), "same_stage");
      expectFail(await moveOpportunity(s, id, { kind: "saved" }, FIXTURE_NOW), "same_column");
      expectFail(await moveOpportunity(s, id, { stageId: "00000000-0000-0000-0000-000000000000" }, FIXTURE_NOW), "not_found");
    } finally {
      await close();
    }
  });

  it("returns not_found for user B on user A's opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await moveOpportunity(b, id, { kind: "applied" }, FIXTURE_NOW), "not_found");
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 9: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/pipeline-move.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/move'`.

- [ ] **Step 10: Write `moveOpportunity`'s algorithm**

`moveOpportunity(s: Scoped, opportunityId: string, target: MoveTarget, now?: Date): Promise<Result<{ from; to }, MoveError>>`
1. `resolvedNow = now ?? new Date()`.
2. Return `s.transaction(async (tx) => { ... })`.
3. `loaded = await loadState(tx, opportunityId)`; `null` is `fail("not_found")`.
4. `plan = planMove(loaded.state, target, resolvedNow)`; `!plan.ok` returns `plan` itself unchanged (same `code`/`message`), propagating rule-level failures (`closed`, `same_stage`, `same_column`, `not_found`) without re-deriving them.
5. `targetStageId = plan.data.to.stageId` (may be `NEW_STAGE` for now).
6. If `plan.data.create` is set: `maxPosition = Math.max(...loaded.state.stages.map((st) => st.position))`; `newStage = await tx.stage.insert({ opportunityId, kind: plan.data.create.kind, label: plan.data.create.label, position: maxPosition + 1 })`; `targetStageId = newStage.id`; build `realOrder` by replacing `NEW_STAGE` in `plan.data.order!` with `newStage.id`; `await tx.stage.renumber(opportunityId, realOrder)`.
7. For each entry in `plan.data.patches`: resolve its `id` (replace `NEW_STAGE` with `targetStageId` when it matches), then `await tx.stage.update(resolvedId, patchFieldsWithoutId)`.
8. `await tx.opportunity.update(opportunityId, { currentStageId: targetStageId })`.
9. `await tx.event.insert({ opportunityId, stageId: targetStageId, kind: "stage_moved", occurredAt: resolvedNow, meta: { from: plan.data.from, to: { ...plan.data.to, stageId: targetStageId } } })`. Exactly one event per call, regardless of how many stages Step 7 patched.
10. Return `ok({ from: plan.data.from, to: { stageId: targetStageId, kind: plan.data.to.kind, label: plan.data.to.label } })`.
- Edge cases: a move that creates a stage still ends with contiguous `0..n` positions, because `renumber` (Task 2) always reassigns every position in the opportunity, not just the new one.
- Error codes: `MoveError` (`closed`, `not_found`, `same_stage`, `same_column`), all from `planMove`; `not_found` is also what a wrong-tenant `opportunityId` produces at Step 3, since a missing row and another user's row are indistinguishable by design.

- [ ] **Step 11: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/integration/pipeline-move.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 12: Write the failing `closeOpportunity`/`reopenOpportunity` tests**

Create `tests/integration/pipeline-close.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import { closeOpportunity, reopenOpportunity } from "@/lib/pipeline/close";
import { expectOk, expectFail } from "../helpers/result";

describe("closeOpportunity and reopenOpportunity", () => {
  it("closing sets status, reason, closed_at and closed_stage_id, and writes one event", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const before = await s.event.listForOpportunity(id);

      expectOk(await closeOpportunity(s, id, "accepted", FIXTURE_NOW));

      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.status).toBe("closed");
      expect(opportunity?.closedReason).toBe("accepted");
      expect(opportunity?.closedAt).toEqual(FIXTURE_NOW);
      expect(opportunity?.closedStageId).toBe(opportunity?.currentStageId);

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].kind).toBe("closed");
    } finally {
      await close();
    }
  });

  it("rejects closing an already-closed opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await closeOpportunity(s, id, "withdrawn", FIXTURE_NOW);
      expectFail(await closeOpportunity(s, id, "withdrawn", FIXTURE_NOW), "closed");
    } finally {
      await close();
    }
  });

  it("reopening round-trips the closed columns back to null and status to active", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await closeOpportunity(s, id, "ghosted", FIXTURE_NOW);
      const before = await s.event.listForOpportunity(id);

      expectOk(await reopenOpportunity(s, id, FIXTURE_NOW));

      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.status).toBe("active");
      expect(opportunity?.closedReason).toBeNull();
      expect(opportunity?.closedAt).toBeNull();
      expect(opportunity?.closedStageId).toBeNull();

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].kind).toBe("reopened");
    } finally {
      await close();
    }
  });

  it("rejects reopening an opportunity that is not closed", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      expectFail(await reopenOpportunity(s, id, FIXTURE_NOW), "not_closed");
    } finally {
      await close();
    }
  });

  it("returns not_found for both functions on an unknown or another user's opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await closeOpportunity(b, id, "withdrawn", FIXTURE_NOW), "not_found");
      expectFail(await reopenOpportunity(b, id, FIXTURE_NOW), "not_found");
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 13: Run it, confirm it fails, then write the algorithm**

```bash
pnpm exec vitest run tests/integration/pipeline-close.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/close'`.

`closeOpportunity(s, opportunityId, reason, now?): Promise<Result<null, "not_found" | "closed">>`
1. `resolvedNow = now ?? new Date()`.
2. `s.transaction(async (tx) => { ... })`.
3. `loaded = await loadState(tx, opportunityId)`; `null` is `fail("not_found")`.
4. `loaded.state.status === "closed"` is `fail("closed")`.
5. `await tx.opportunity.update(opportunityId, { status: "closed", closedReason: reason, closedAt: resolvedNow, closedStageId: loaded.opportunity.currentStageId })`.
6. `await tx.event.insert({ opportunityId, kind: "closed", occurredAt: resolvedNow, meta: { reason } })`.
7. Return `ok(null)`.
- Error codes: `not_found`, `closed` (already closed).

`reopenOpportunity(s, opportunityId, now?): Promise<Result<null, "not_found" | "not_closed">>`
1. `resolvedNow = now ?? new Date()`.
2. `s.transaction(async (tx) => { ... })`.
3. `loaded = await loadState(tx, opportunityId)`; `null` is `fail("not_found")`.
4. `loaded.state.status !== "closed"` is `fail("not_closed")`.
5. `await tx.opportunity.update(opportunityId, { status: "active", closedReason: null, closedAt: null, closedStageId: null })`.
6. `await tx.event.insert({ opportunityId, kind: "reopened", occurredAt: resolvedNow, meta: {} })`.
7. Return `ok(null)`.
- Error codes: `not_found`, `not_closed`.

Both write `lib/pipeline/close.ts`.

- [ ] **Step 14: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/integration/pipeline-close.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

- [ ] **Step 15: Write the failing stage-edit tests**

Create `tests/integration/pipeline-stages.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, stageIdsByKind, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import {
  addStage,
  renameStage,
  reorderStages,
  skipStage,
  unskipStage,
  removeStage,
} from "@/lib/pipeline/stages";
import { closeOpportunity } from "@/lib/pipeline/close";
import { moveOpportunity } from "@/lib/pipeline/move";
import { expectOk, expectFail } from "../helpers/result";

describe("addStage", () => {
  it("inserts a new stage and keeps positions 0..n with no gaps", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const result = expectOk(await addStage(s, id, "portfolio_case", "Take-home"));
      const stages = await s.stage.listForOpportunity(id);
      expect(stages).toHaveLength(8);
      expect(stages.map((st) => st.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(stages.find((st) => st.id === result.stageId)?.label).toBe("Take-home");
    } finally {
      await close();
    }
  });

  it("rejects adding Saved, Applied or Offer again, a blank label, or editing a closed job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      expectFail(await addStage(s, id, "saved", "Extra"), "fixed_stage");
      expectFail(await addStage(s, id, "portfolio_case", "  "), "label_required");
      await closeOpportunity(s, id, "withdrawn", FIXTURE_NOW);
      expectFail(await addStage(s, id, "portfolio_case", "Take-home"), "closed");
    } finally {
      await close();
    }
  });

  it("returns not_found for user B on user A's opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await addStage(b, id, "portfolio_case", "Take-home"), "not_found");
    } finally {
      await close();
    }
  });
});

describe("renameStage", () => {
  it("renames any stage, including a fixed one", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectOk(await renameStage(s, id, byKind.saved, "Long-listed"));
      const stages = await s.stage.listForOpportunity(id);
      expect(stages.find((st) => st.id === byKind.saved)?.label).toBe("Long-listed");
    } finally {
      await close();
    }
  });

  it("rejects an unknown stage, a blank label, and editing a closed job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectFail(await renameStage(s, id, "00000000-0000-0000-0000-000000000000", "X"), "not_found");
      expectFail(await renameStage(s, id, byKind.saved, "   "), "label_required");
      await closeOpportunity(s, id, "withdrawn", FIXTURE_NOW);
      expectFail(await renameStage(s, id, byKind.saved, "X"), "closed");
    } finally {
      await close();
    }
  });
});

describe("reorderStages", () => {
  it("accepts a valid permutation and rejects an invalid one", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner5@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const swapped = [
        byKind.saved,
        byKind.applied,
        byKind.hiring_manager,
        byKind.recruiter_screen,
        byKind.portfolio_case,
        byKind.panel_final,
        byKind.offer,
      ];
      expectOk(await reorderStages(s, id, swapped));
      const stages = await s.stage.listForOpportunity(id);
      expect(stages.map((st) => st.id)).toEqual(swapped);

      const invalid = [...swapped].reverse();
      expectFail(await reorderStages(s, id, invalid), "invalid_order");
    } finally {
      await close();
    }
  });
});

describe("skipStage and unskipStage", () => {
  it("skips an upcoming non-current stage and unskips it back to upcoming", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner6@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectOk(await skipStage(s, id, byKind.recruiter_screen));
      let stages = await s.stage.listForOpportunity(id);
      expect(stages.find((st) => st.id === byKind.recruiter_screen)?.status).toBe("skipped");

      expectOk(await unskipStage(s, id, byKind.recruiter_screen, FIXTURE_NOW));
      stages = await s.stage.listForOpportunity(id);
      expect(stages.find((st) => st.id === byKind.recruiter_screen)?.status).toBe("upcoming");
    } finally {
      await close();
    }
  });

  it("rejects skipping the current stage and unskipping a stage that is not skipped", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner7@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectFail(await skipStage(s, id, byKind.saved), "stage_current");
      expectFail(await unskipStage(s, id, byKind.applied, FIXTURE_NOW), "not_skipped");
    } finally {
      await close();
    }
  });
});

describe("removeStage", () => {
  it("removes a flexible, non-current, non-done stage and leaves positions 0..n with no gaps", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner8@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectOk(await removeStage(s, id, byKind.panel_final));
      const stages = await s.stage.listForOpportunity(id);
      expect(stages).toHaveLength(6);
      expect(stages.map((st) => st.position)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(stages.some((st) => st.kind === "panel_final")).toBe(false);
    } finally {
      await close();
    }
  });

  it("rejects removing Saved, Applied, Offer, or the current stage", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner9@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectFail(await removeStage(s, id, byKind.saved), "fixed_stage");
      expectFail(await removeStage(s, id, byKind.applied), "fixed_stage");
      expectFail(await removeStage(s, id, byKind.offer), "fixed_stage");

      // Saved is both fixed and current; fixed_stage wins (planRemove checks
      // it first). Move on to a flexible stage so stage_current can be
      // tested on its own, with a kind that is neither fixed nor already
      // current.
      await moveOpportunity(s, id, { kind: "recruiter_screen" }, FIXTURE_NOW);
      expectFail(await removeStage(s, id, byKind.recruiter_screen), "stage_current");
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 16: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/pipeline-stages.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/stages'`.

- [ ] **Step 17: Write the stage-edit algorithms**

All six live in `lib/pipeline/stages.ts` and share one shape: load state inside a transaction, call the matching rule, apply what it returns, no event (rule: "Stage edits write no events in this milestone").

`addStage(s, opportunityId, kind, label): Promise<Result<{ stageId: string }, EditError>>`
1. `s.transaction(async (tx) => { ... })`.
2. `loaded = await loadState(tx, opportunityId)`; `null` is `fail("not_found")`.
3. `result = planAddStage(loaded.state, kind, label)`; `!result.ok` returns it unchanged.
4. `maxPosition = loaded.state.stages.length` (contiguous `0..n-1`, so this is the next free position).
5. `newStage = await tx.stage.insert({ opportunityId, kind: result.data.create.kind, label: result.data.create.label, position: maxPosition })`.
6. `realOrder = result.data.order.map((x) => (x === NEW_STAGE ? newStage.id : x))`; `await tx.stage.renumber(opportunityId, realOrder)`.
7. Return `ok({ stageId: newStage.id })`.

`renameStage(s, opportunityId, stageId, label): Promise<Result<null, EditError>>`
1. `s.transaction(async (tx) => { ... })`.
2. `loaded = await loadState(tx, opportunityId)`; `null` is `fail("not_found")`.
3. `result = planRename(loaded.state, stageId, label)`; `!result.ok` returns it unchanged.
4. `await tx.stage.update(stageId, { label: result.data.label })`.
5. Return `ok(null)`.

`reorderStages(s, opportunityId, orderedIds): Promise<Result<null, EditError>>`
1. `s.transaction(async (tx) => { ... })`.
2. `loaded = await loadState(tx, opportunityId)`; `null` is `fail("not_found")`.
3. `result = planReorder(loaded.state, orderedIds)`; `!result.ok` returns it unchanged.
4. `await tx.stage.renumber(opportunityId, result.data.order)`.
5. Return `ok(null)`.

`skipStage(s, opportunityId, stageId): Promise<Result<null, EditError>>`
1. `s.transaction(async (tx) => { ... })`.
2. `loaded = await loadState(tx, opportunityId)`; `null` is `fail("not_found")`.
3. `result = planSkip(loaded.state, stageId)`; `!result.ok` returns it unchanged.
4. `await tx.stage.update(stageId, { status: result.data.status })`.
5. Return `ok(null)`.

`unskipStage(s, opportunityId, stageId, now?): Promise<Result<null, EditError>>`
1. `resolvedNow = now ?? new Date()`.
2. `s.transaction(async (tx) => { ... })`.
3. `loaded = await loadState(tx, opportunityId)`; `null` is `fail("not_found")`.
4. `result = planUnskip(loaded.state, stageId, resolvedNow)`; `!result.ok` returns it unchanged.
5. `await tx.stage.update(stageId, { status: result.data.status })`.
6. Return `ok(null)`.

`removeStage(s, opportunityId, stageId): Promise<Result<null, EditError>>`
1. `s.transaction(async (tx) => { ... })`.
2. `loaded = await loadState(tx, opportunityId)`; `null` is `fail("not_found")`.
3. `result = planRemove(loaded.state, stageId)`; `!result.ok` returns it unchanged.
4. `await tx.stage.remove(stageId)`.
5. `await tx.stage.renumber(opportunityId, result.data.order)`.
6. Return `ok(null)`.

- Edge cases (shared): `EditError`'s `not_found` fires both for an unknown `stageId` (from the rule function) and for an unknown or wrong-tenant `opportunityId` (from `loadState` returning `null`); the two are indistinguishable by design.
- Error codes (shared): `closed`, `not_found`, plus whichever of `fixed_stage`, `stage_current`, `stage_done`, `stage_has_artifacts`, `invalid_order`, `label_required`, `not_skippable`, `not_skipped` that function's rule can return (see Task 3's per-function list).

- [ ] **Step 18: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/integration/pipeline-stages.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 10 passed (10)`.

- [ ] **Step 19: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0.

- [ ] **Step 20: Commit**

```bash
git add lib/pipeline/create.ts lib/pipeline/create-schema.ts lib/pipeline/move.ts lib/pipeline/close.ts lib/pipeline/stages.ts lib/pipeline/snapshot.ts tests/integration/pipeline-create.test.ts tests/integration/pipeline-move.test.ts tests/integration/pipeline-close.test.ts tests/integration/pipeline-stages.test.ts tests/helpers/opportunity-fixture.ts
git commit -m "$(cat <<'EOF'
feat: add pipeline persistence for create, move, close and stage edits

EOF
)"
```

---

### Task 5: Next action, notes, schedule, details, people, job read model

**Files:**
- Create: `lib/pipeline/next-action.ts`, `lib/pipeline/notes.ts`, `lib/pipeline/schedule.ts`, `lib/pipeline/details.ts`, `lib/people/index.ts`, `lib/pipeline/read.ts`, `lib/pipeline/place.ts`
- Test: `tests/integration/pipeline-next-action.test.ts`, `tests/integration/pipeline-notes.test.ts`, `tests/integration/pipeline-schedule.test.ts`, `tests/integration/pipeline-details.test.ts`, `tests/integration/people.test.ts`, `tests/integration/pipeline-read.test.ts`, `tests/integration/pipeline-place.test.ts`

**Interfaces:**
- Consumes: `Scoped` and every method on it (Task 2). `Result`, `ok`, `fail` (Task 3). `loadState` (Task 4). `StageFormat`, `PersonRole`, `WorkMode` from `lib/pipeline/values.ts` (Task 1). `CreateOpportunityInput` from `lib/pipeline/create.ts` (Task 4, for `updateOpportunityDetails`'s `Pick<...>`). `seedOpportunity`, `stageIdsByKind`, `FIXTURE_NOW` from `tests/helpers/opportunity-fixture.ts` (Task 4). `expectOk`, `expectFail` from `tests/helpers/result.ts` (Task 3). `makeTestDb`, `createTestUser` from `tests/helpers/db.ts`.
- Produces (copied from the frame character for character):

```typescript
// lib/pipeline/next-action.ts
export function setNextAction(s: Scoped, opportunityId: string, input: { text: string; at: Date | null }): Promise<Result<null, "not_found" | "invalid">>;
export function completeNextAction(s: Scoped, opportunityId: string, now?: Date): Promise<Result<null, "not_found" | "nothing_to_complete">>;
// lib/pipeline/notes.ts
export function addNote(s: Scoped, opportunityId: string, body: string, now?: Date): Promise<Result<{ eventId: string }, "not_found" | "invalid">>;
// lib/pipeline/schedule.ts
export function scheduleStage(s: Scoped, opportunityId: string, stageId: string, input: { scheduledAt: Date | null; format: StageFormat | null }, now?: Date): Promise<Result<null, "not_found" | "closed">>;
export function setStageOutcome(s: Scoped, opportunityId: string, stageId: string, outcomeMd: string): Promise<Result<null, "not_found">>;
// lib/pipeline/details.ts
export function updateOpportunityDetails(s: Scoped, opportunityId: string, input: Partial<Pick<CreateOpportunityInput, "roleTitle" | "location" | "workMode" | "sourceUrl" | "compMin" | "compMax" | "compCurrency" | "compNote" | "myAsk">>): Promise<Result<null, "not_found" | "invalid">>;
export function updateCompanyDetails(s: Scoped, companyId: string, input: { domain?: string; careersUrl?: string; size?: string; industry?: string; hq?: string; notesMd?: string }): Promise<Result<null, "not_found" | "invalid">>;
// lib/people/index.ts
export type PersonInput = { name: string; title?: string; linkedinUrl?: string; email?: string; notesMd?: string; role: PersonRole; stageId?: string | null };
export function addPersonToOpportunity(s: Scoped, opportunityId: string, input: PersonInput): Promise<Result<{ linkId: string; personId: string }, "not_found" | "invalid">>;
export function updateLinkedPerson(s: Scoped, opportunityId: string, linkId: string, input: PersonInput): Promise<Result<null, "not_found" | "invalid">>;
export function unlinkPerson(s: Scoped, opportunityId: string, linkId: string): Promise<Result<null, "not_found">>;
// lib/pipeline/read.ts
export type JobView = { opportunity: OpportunityRow; company: CompanyRow; stages: StageRow[]; currentStage: StageRow; people: LinkedPerson[]; events: EventRow[] };
export function getJobView(s: Scoped, slug: string): Promise<JobView | null>;
// lib/pipeline/place.ts
export function placeOpportunity(s: Scoped, opportunityId: string, kind: StageKind, options?: { appliedAt?: Date; now?: Date }): Promise<Result<null, MoveError>>;
```

Plus, the Zod schemas this task adds (full code, Step 1): `setNextActionSchema`, `addNoteSchema`, `updateOpportunityDetailsSchema`, `updateCompanyDetailsSchema`, `personInputSchema`.

None of the functions in this task touch `opportunity.status`, `opportunity.current_stage_id` or the `closed_*` columns, so none of them need to run inside a transaction or call `loadState`'s locking read, except `scheduleStage`, which writes a `stage_moved`-adjacent event conditionally and checks `closed`, and so follows the same transaction shape Task 4 used.

- [ ] **Step 1: Write the Zod schemas in full**

Verified in a planning scratch file (`zod-task5-spike.ts`, not kept in the repo): `z.email()`, `z.uuid()` and `z.enum()` over an `as const` array all narrow and validate exactly as used below.

Create `lib/pipeline/next-action.ts`'s schema (top of the file, function follows in Step 5):

```typescript
import { z } from "zod";

export const setNextActionSchema = z.object({
  text: z.string().trim().min(1),
  at: z.date().nullable(),
});
```

Create `lib/pipeline/notes.ts`'s schema (top of the file, function follows in Step 7):

```typescript
import { z } from "zod";

export const addNoteSchema = z.object({
  body: z.string().trim().min(1),
});
```

Create `lib/pipeline/details.ts`'s schemas (top of the file, functions follow in Step 11):

```typescript
import { z } from "zod";
import { WORK_MODES } from "@/lib/pipeline/values";

export const updateOpportunityDetailsSchema = z
  .object({
    roleTitle: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1).optional(),
    workMode: z.enum(WORK_MODES).optional(),
    sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
    compMin: z.number().int().nonnegative().optional(),
    compMax: z.number().int().nonnegative().optional(),
    compCurrency: z.string().trim().min(1).optional(),
    compNote: z.string().optional(),
    myAsk: z.string().optional(),
  })
  .refine((v) => v.compMin === undefined || v.compMax === undefined || v.compMin <= v.compMax, {
    message: "compMin must be less than or equal to compMax",
    path: ["compMax"],
  });

export const updateCompanyDetailsSchema = z.object({
  domain: z.string().trim().min(1).optional(),
  careersUrl: z.url({ protocol: /^https?$/ }).optional(),
  size: z.string().trim().min(1).optional(),
  industry: z.string().trim().min(1).optional(),
  hq: z.string().trim().min(1).optional(),
  notesMd: z.string().optional(),
});
```

Create `lib/people/index.ts`'s schema (top of the file, functions follow in Step 13):

```typescript
import { z } from "zod";
import { PERSON_ROLES } from "@/lib/pipeline/values";

export const personInputSchema = z.object({
  name: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  linkedinUrl: z.url({ protocol: /^https?$/ }).optional(),
  email: z.email().optional(),
  notesMd: z.string().optional(),
  role: z.enum(PERSON_ROLES),
  stageId: z.uuid().nullable().optional(),
});
```

`scheduleStage` and `setStageOutcome` (Step 9) have no `"invalid"` error code in their signatures, so they take their `format`/`scheduledAt`/`outcomeMd` arguments as already-typed values with no Zod schema of their own, matching exactly what the frame's signatures say.

- [ ] **Step 2: Write the failing next-action tests**

Create `tests/integration/pipeline-next-action.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import { setNextAction, completeNextAction } from "@/lib/pipeline/next-action";
import { expectOk, expectFail } from "../helpers/result";

describe("setNextAction", () => {
  it("sets the text and date", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const at = new Date("2026-09-25T09:00:00.000Z");
      expectOk(await setNextAction(s, id, { text: "Follow up with recruiter", at }));
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.nextAction).toBe("Follow up with recruiter");
      expect(opportunity?.nextActionAt).toEqual(at);
    } finally {
      await close();
    }
  });

  it("accepts a null date", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      expectOk(await setNextAction(s, id, { text: "Apply", at: null }));
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.nextActionAt).toBeNull();
    } finally {
      await close();
    }
  });

  it("rejects a blank text and an unknown or wrong-tenant opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await setNextAction(a, id, { text: "   ", at: null }), "invalid");
      expectFail(await setNextAction(b, id, { text: "Apply", at: null }), "not_found");
    } finally {
      await close();
    }
  });
});

describe("completeNextAction", () => {
  it("writes next_action_done with the text in body, then clears both columns", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await setNextAction(s, id, { text: "Follow up", at: null });
      const before = await s.event.listForOpportunity(id);

      expectOk(await completeNextAction(s, id, FIXTURE_NOW));

      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.nextAction).toBeNull();
      expect(opportunity?.nextActionAt).toBeNull();

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].kind).toBe("next_action_done");
      expect(after[0].body).toBe("Follow up");
    } finally {
      await close();
    }
  });

  it("rejects completing when there is nothing to complete, and on a wrong-tenant opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const bob = await createTestUser(db, "bob2@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await completeNextAction(a, id, FIXTURE_NOW), "nothing_to_complete");
      expectFail(await completeNextAction(b, id, FIXTURE_NOW), "not_found");
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/pipeline-next-action.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/next-action'`.

- [ ] **Step 4: Write `setNextAction`'s and `completeNextAction`'s algorithms**

`setNextAction(s, opportunityId, input): Promise<Result<null, "not_found" | "invalid">>`
1. Validate `input` with `setNextActionSchema.safeParse`; on failure, `fail("invalid", ...)`.
2. `row = await s.opportunity.getById(opportunityId)`; `null` is `fail("not_found")`.
3. `await s.opportunity.update(opportunityId, { nextAction: input.text.trim(), nextActionAt: input.at })`.
4. Return `ok(null)`.
- Edge case: no closed check. The frame's signature lists only `"not_found" | "invalid"`, and `next_action`/`next_action_at` are not in the list of columns `lib/pipeline` alone may write for pipeline *state* (they are ordinary fields, not stage/status columns), so a closed job can still get a next action queued for after it reopens.
- Error codes: `not_found`, `invalid` (blank text).

`completeNextAction(s, opportunityId, now?): Promise<Result<null, "not_found" | "nothing_to_complete">>`
1. `resolvedNow = now ?? new Date()`.
2. Return `s.transaction(async (tx) => { ... })`.
3. `row = await tx.opportunity.lockById(opportunityId)`; `null` is `fail("not_found")`.
4. `row.nextAction === null` is `fail("nothing_to_complete")`.
5. `await tx.event.insert({ opportunityId, kind: "next_action_done", body: row.nextAction, occurredAt: resolvedNow, meta: {} })`.
6. `await tx.opportunity.update(opportunityId, { nextAction: null, nextActionAt: null })`.
7. Return `ok(null)`.
- Edge case: reading `nextAction` and then writing the event and the clear in separate, unlocked statements would let two near-simultaneous calls (a double click) both read the same not-yet-cleared `nextAction`, both pass the `nothing_to_complete` check, and both insert a `next_action_done` event. Running the read through `tx.opportunity.lockById` inside `s.transaction` takes the same `SELECT ... FOR UPDATE` lock `moveOpportunity` (Task 4) relies on, so the second call blocks until the first commits and then correctly sees `nextAction` already cleared.
- Error codes: `not_found`, `nothing_to_complete` (no next action is set).

- [ ] **Step 5: Implement `lib/pipeline/next-action.ts`, run the tests, confirm they pass**

```bash
pnpm exec vitest run tests/integration/pipeline-next-action.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

- [ ] **Step 6: Write the failing notes test**

Create `tests/integration/pipeline-notes.test.ts`:

```typescript
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
```

- [ ] **Step 7: Run it, confirm it fails, then write the algorithm**

```bash
pnpm exec vitest run tests/integration/pipeline-notes.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/notes'`.

`addNote(s, opportunityId, body, now?): Promise<Result<{ eventId: string }, "not_found" | "invalid">>`
1. Validate `{ body }` with `addNoteSchema.safeParse`; on failure, `fail("invalid", ...)`.
2. `row = await s.opportunity.getById(opportunityId)`; `null` is `fail("not_found")`.
3. `resolvedNow = now ?? new Date()`.
4. `eventRow = await s.event.insert({ opportunityId, kind: "note", body: body.trim(), occurredAt: resolvedNow, meta: {} })`.
5. Return `ok({ eventId: eventRow.id })`.
- Error codes: `not_found`, `invalid` (blank body).

- [ ] **Step 8: Implement `lib/pipeline/notes.ts`, run the tests, confirm they pass**

```bash
pnpm exec vitest run tests/integration/pipeline-notes.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 2 passed (2)`.

- [ ] **Step 9: Write the failing schedule tests**

Create `tests/integration/pipeline-schedule.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, stageIdsByKind, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import { scheduleStage, setStageOutcome } from "@/lib/pipeline/schedule";
import { closeOpportunity } from "@/lib/pipeline/close";
import { expectOk, expectFail } from "../helpers/result";

const FUTURE = new Date("2026-10-01T09:00:00.000Z");
const PAST = new Date("2026-09-01T09:00:00.000Z");

describe("scheduleStage", () => {
  it("a future date on an upcoming stage makes it scheduled and writes interview_scheduled", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const before = await s.event.listForOpportunity(id);

      expectOk(
        await scheduleStage(s, id, byKind.recruiter_screen, { scheduledAt: FUTURE, format: "video" }, FIXTURE_NOW),
      );

      const stages = await s.stage.listForOpportunity(id);
      const recruiterScreen = stages.find((st) => st.id === byKind.recruiter_screen)!;
      expect(recruiterScreen.status).toBe("scheduled");
      expect(recruiterScreen.scheduledAt).toEqual(FUTURE);
      expect(recruiterScreen.format).toBe("video");

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].kind).toBe("interview_scheduled");
      expect((after[0].meta as { stageLabel: string }).stageLabel).toBe(recruiterScreen.label);
    } finally {
      await close();
    }
  });

  it("a past date leaves status as it is and writes no event", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const before = await s.event.listForOpportunity(id);

      expectOk(
        await scheduleStage(s, id, byKind.recruiter_screen, { scheduledAt: PAST, format: "phone" }, FIXTURE_NOW),
      );

      const stages = await s.stage.listForOpportunity(id);
      const recruiterScreen = stages.find((st) => st.id === byKind.recruiter_screen)!;
      expect(recruiterScreen.status).toBe("upcoming");
      expect(recruiterScreen.scheduledAt).toEqual(PAST);

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length);
    } finally {
      await close();
    }
  });

  it("clearing the date returns a scheduled stage to upcoming", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      await scheduleStage(s, id, byKind.recruiter_screen, { scheduledAt: FUTURE, format: "video" }, FIXTURE_NOW);

      expectOk(await scheduleStage(s, id, byKind.recruiter_screen, { scheduledAt: null, format: null }, FIXTURE_NOW));

      const stages = await s.stage.listForOpportunity(id);
      const recruiterScreen = stages.find((st) => st.id === byKind.recruiter_screen)!;
      expect(recruiterScreen.status).toBe("upcoming");
      expect(recruiterScreen.scheduledAt).toBeNull();
    } finally {
      await close();
    }
  });

  it("rejects scheduling on a closed opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      await closeOpportunity(s, id, "withdrawn", FIXTURE_NOW);
      expectFail(
        await scheduleStage(s, id, byKind.recruiter_screen, { scheduledAt: FUTURE, format: "video" }, FIXTURE_NOW),
        "closed",
      );
    } finally {
      await close();
    }
  });

  it("returns not_found for an unknown stage or a wrong-tenant opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      const byKind = await stageIdsByKind(a, id);
      expectFail(
        await scheduleStage(a, id, "00000000-0000-0000-0000-000000000000", { scheduledAt: FUTURE, format: null }, FIXTURE_NOW),
        "not_found",
      );
      expectFail(
        await scheduleStage(b, id, byKind.recruiter_screen, { scheduledAt: FUTURE, format: null }, FIXTURE_NOW),
        "not_found",
      );
    } finally {
      await close();
    }
  });
});

describe("setStageOutcome", () => {
  it("sets the outcome notes on a stage of this opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner5@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectOk(await setStageOutcome(s, id, byKind.saved, "Went well, moving forward."));
      const stages = await s.stage.listForOpportunity(id);
      expect(stages.find((st) => st.id === byKind.saved)?.outcomeMd).toBe("Went well, moving forward.");
    } finally {
      await close();
    }
  });

  it("rejects a stage that belongs to a different opportunity, even one this user owns", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner6@example.com");
      const s = scoped(db, user.id);
      const first = await seedOpportunity(s, { roleTitle: "Product Designer" });
      const second = await seedOpportunity(s, { roleTitle: "Staff Designer" });
      const secondStages = await stageIdsByKind(s, second.id);
      expectFail(await setStageOutcome(s, first.id, secondStages.saved, "Wrong job"), "not_found");
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 10: Run it, confirm it fails, then write the algorithms**

```bash
pnpm exec vitest run tests/integration/pipeline-schedule.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/schedule'`.

`scheduleStage(s, opportunityId, stageId, input, now?): Promise<Result<null, "not_found" | "closed">>`
1. `resolvedNow = now ?? new Date()`.
2. `s.transaction(async (tx) => { ... })`.
3. `loaded = await loadState(tx, opportunityId)`; `null` is `fail("not_found")`.
4. `loaded.state.status === "closed"` is `fail("closed")`.
5. `stage = loaded.state.stages.find((st) => st.id === stageId)`; not found is `fail("not_found")` (this is what makes a stage id from a different opportunity, even one this same user owns, come back `not_found`: `loaded.state.stages` only ever contains rows for `opportunityId`).
6. `isFuture = input.scheduledAt !== null && input.scheduledAt.getTime() > resolvedNow.getTime()`.
7. Decide the new status: when `stage.status === "upcoming"` and `isFuture`, `newStatus = "scheduled"` and this call will write an event (frame's named case, "a future date on an upcoming stage makes it scheduled"). When `stage.status === "scheduled"` and `input.scheduledAt === null`, `newStatus = "upcoming"` and no event (frame's named case, "clearing the date returns scheduled to upcoming"). Otherwise `newStatus = stage.status` unchanged (this covers the frame's "a past date" case: status stays as it is, and every other combination not named by the frame, such as rescheduling an already-scheduled stage to a different future date).
8. `await tx.stage.update(stageId, { scheduledAt: input.scheduledAt, format: input.format, status: newStatus })`.
9. Only in the "becomes scheduled" branch of Step 7: `await tx.event.insert({ opportunityId, stageId, kind: "interview_scheduled", occurredAt: resolvedNow, meta: { stageLabel: stage.label, scheduledAt: input.scheduledAt.toISOString(), format: input.format } })`.
10. Return `ok(null)`.
- Edge cases: a past date does not revert an already-`"scheduled"` stage to `"upcoming"` (only clearing the date does); scheduling a stage that is `"done"` or `"skipped"` updates `scheduledAt`/`format` but never changes its status (Step 7's two named branches both require a specific starting status).
- Error codes: `not_found` (unknown `stageId`, one from a different opportunity, or a wrong-tenant `opportunityId`), `closed`.

`setStageOutcome(s, opportunityId, stageId, outcomeMd): Promise<Result<null, "not_found">>`
1. `stages = await s.stage.listForOpportunity(opportunityId)`; this is already tenant-scoped (Task 2), so it is also how a wrong-tenant `opportunityId` produces `not_found` here.
2. `stage = stages.find((st) => st.id === stageId)`; not found (including a real stage id that belongs to a different opportunity of this same user) is `fail("not_found")`.
3. `await s.stage.update(stageId, { outcomeMd })`.
4. Return `ok(null)`.
- No transaction: `outcome_md` is not one of the columns `lib/pipeline` reserves for stage-transition state, and this never touches `status`.
- Error codes: `not_found`.

Both live in `lib/pipeline/schedule.ts`.

- [ ] **Step 11: Implement `lib/pipeline/schedule.ts`, run the tests, confirm they pass**

```bash
pnpm exec vitest run tests/integration/pipeline-schedule.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 7 passed (7)`.

- [ ] **Step 12: Write the failing details tests**

Create `tests/integration/pipeline-details.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity } from "../helpers/opportunity-fixture";
import { updateOpportunityDetails, updateCompanyDetails } from "@/lib/pipeline/details";
import { expectOk, expectFail } from "../helpers/result";

describe("updateOpportunityDetails", () => {
  it("updates the given fields and leaves others untouched", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s, { location: "Remote" });
      expectOk(await updateOpportunityDetails(s, id, { roleTitle: "Staff Product Designer", compMin: 140000, compMax: 180000 }));
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.roleTitle).toBe("Staff Product Designer");
      expect(opportunity?.compMin).toBe(140000);
      expect(opportunity?.compMax).toBe(180000);
      expect(opportunity?.location).toBe("Remote");
    } finally {
      await close();
    }
  });

  it("rejects invalid input and a wrong-tenant opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await updateOpportunityDetails(a, id, { compMin: 200000, compMax: 100000 }), "invalid");
      expectFail(await updateOpportunityDetails(a, id, { sourceUrl: "not-a-url" }), "invalid");
      expectFail(await updateOpportunityDetails(b, id, { roleTitle: "Hacked" }), "not_found");
    } finally {
      await close();
    }
  });
});

describe("updateCompanyDetails", () => {
  it("updates the given fields", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const opportunity = await s.opportunity.getById(id);
      expectOk(
        await updateCompanyDetails(s, opportunity!.companyId, {
          domain: "acme.example",
          industry: "Robotics",
        }),
      );
      const company = await s.company.getById(opportunity!.companyId);
      expect(company?.domain).toBe("acme.example");
      expect(company?.industry).toBe("Robotics");
    } finally {
      await close();
    }
  });

  it("rejects invalid input and a wrong-tenant company", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const bob = await createTestUser(db, "bob2@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      const opportunity = await a.opportunity.getById(id);
      expectFail(await updateCompanyDetails(a, opportunity!.companyId, { careersUrl: "not-a-url" }), "invalid");
      expectFail(await updateCompanyDetails(b, opportunity!.companyId, { domain: "hacked.example" }), "not_found");
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 13: Run it, confirm it fails, then write the algorithms**

```bash
pnpm exec vitest run tests/integration/pipeline-details.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/details'`.

`updateOpportunityDetails(s, opportunityId, input): Promise<Result<null, "not_found" | "invalid">>`
1. Validate `input` with `updateOpportunityDetailsSchema.safeParse`; on failure, `fail("invalid", ...)`.
2. `row = await s.opportunity.getById(opportunityId)`; `null` is `fail("not_found")`.
3. `await s.opportunity.update(opportunityId, { ...the validated, trimmed fields present in input })`. Only fields present in `input` are passed through (all are optional in the schema); omitted fields are left alone by `opportunity.update`'s own partial-update semantics (Task 2).
4. Return `ok(null)`.
- Error codes: `not_found`, `invalid` (bad `sourceUrl`, `compMin > compMax`, or a blank string on a field that requires one when present).

`updateCompanyDetails(s, companyId, input): Promise<Result<null, "not_found" | "invalid">>`
1. Validate `input` with `updateCompanyDetailsSchema.safeParse`; on failure, `fail("invalid", ...)`.
2. `row = await s.company.getById(companyId)`; `null` is `fail("not_found")`.
3. `await s.company.update(companyId, { ...input })`.
4. Return `ok(null)`.
- Error codes: `not_found`, `invalid`.

Both live in `lib/pipeline/details.ts`.

- [ ] **Step 14: Implement `lib/pipeline/details.ts`, run the tests, confirm they pass**

```bash
pnpm exec vitest run tests/integration/pipeline-details.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 4 passed (4)`.

- [ ] **Step 15: Write the failing people tests**

Create `tests/integration/people.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, stageIdsByKind } from "../helpers/opportunity-fixture";
import { addPersonToOpportunity, updateLinkedPerson, unlinkPerson } from "@/lib/people";
import { expectOk, expectFail } from "../helpers/result";

describe("addPersonToOpportunity", () => {
  it("creates a person under the opportunity's company and links it", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const opportunity = await s.opportunity.getById(id);

      const result = expectOk(
        await addPersonToOpportunity(s, id, { name: "Priya Raman", role: "recruiter", email: "priya@example.com" }),
      );

      const person = await s.person.getById(result.personId);
      expect(person?.companyId).toBe(opportunity!.companyId);
      const links = await s.opportunityPerson.listForOpportunity(id);
      expect(links).toHaveLength(1);
      expect(links[0].linkId).toBe(result.linkId);
      expect(links[0].role).toBe("recruiter");
    } finally {
      await close();
    }
  });

  it("accepts a stageId that belongs to this opportunity and rejects one that does not", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const first = await seedOpportunity(s, { roleTitle: "Product Designer" });
      const second = await seedOpportunity(s, { roleTitle: "Staff Designer" });
      const firstStages = await stageIdsByKind(s, first.id);
      const secondStages = await stageIdsByKind(s, second.id);

      const result = expectOk(
        await addPersonToOpportunity(s, first.id, {
          name: "Priya Raman",
          role: "interviewer",
          stageId: firstStages.recruiter_screen,
        }),
      );
      const links = await s.opportunityPerson.listForOpportunity(first.id);
      expect(links.find((l) => l.linkId === result.linkId)?.stageId).toBe(firstStages.recruiter_screen);

      expectFail(
        await addPersonToOpportunity(s, first.id, {
          name: "Someone Else",
          role: "interviewer",
          stageId: secondStages.recruiter_screen,
        }),
        "invalid",
      );
    } finally {
      await close();
    }
  });

  it("rejects invalid input and a wrong-tenant opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await addPersonToOpportunity(a, id, { name: "  ", role: "recruiter" }), "invalid");
      expectFail(await addPersonToOpportunity(b, id, { name: "Someone", role: "recruiter" }), "not_found");
    } finally {
      await close();
    }
  });
});

describe("updateLinkedPerson and unlinkPerson", () => {
  it("updates the person and the link's role and stage", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const created = expectOk(await addPersonToOpportunity(s, id, { name: "Priya Raman", role: "recruiter" }));

      expectOk(
        await updateLinkedPerson(s, id, created.linkId, {
          name: "Priya Raman-Singh",
          role: "hiring_manager",
        }),
      );

      const person = await s.person.getById(created.personId);
      expect(person?.name).toBe("Priya Raman-Singh");
      const links = await s.opportunityPerson.listForOpportunity(id);
      expect(links.find((l) => l.linkId === created.linkId)?.role).toBe("hiring_manager");
    } finally {
      await close();
    }
  });

  it("rejects an unknown link, invalid input, and unlinks a real one", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const created = expectOk(await addPersonToOpportunity(s, id, { name: "Priya Raman", role: "recruiter" }));

      expectFail(
        await updateLinkedPerson(s, id, "00000000-0000-0000-0000-000000000000", { name: "X", role: "recruiter" }),
        "not_found",
      );
      expectFail(await updateLinkedPerson(s, id, created.linkId, { name: "  ", role: "recruiter" }), "invalid");

      expectOk(await unlinkPerson(s, id, created.linkId));
      expect(await s.opportunityPerson.listForOpportunity(id)).toEqual([]);
      expectFail(await unlinkPerson(s, id, created.linkId), "not_found");
    } finally {
      await close();
    }
  });

  it("returns not_found for user B on user A's link", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const bob = await createTestUser(db, "bob2@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      const created = expectOk(await addPersonToOpportunity(a, id, { name: "Priya Raman", role: "recruiter" }));
      expectFail(await updateLinkedPerson(b, id, created.linkId, { name: "X", role: "recruiter" }), "not_found");
      expectFail(await unlinkPerson(b, id, created.linkId), "not_found");
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 16: Run it, confirm it fails, then write the algorithms**

```bash
pnpm exec vitest run tests/integration/people.test.ts
```

Expected: fails with `Cannot find module '@/lib/people'`.

`addPersonToOpportunity(s, opportunityId, input): Promise<Result<{ linkId: string; personId: string }, "not_found" | "invalid">>`
1. Validate `input` with `personInputSchema.safeParse`; on failure, `fail("invalid", ...)`.
2. `opportunity = await s.opportunity.getById(opportunityId)`; `null` is `fail("not_found")`.
3. If `input.stageId` is present: `stages = await s.stage.listForOpportunity(opportunityId)`; if none has that id, `fail("invalid", ...)` (the frame's own words: "`stageId`, when given, must be a stage of that opportunity, otherwise `invalid`").
4. `person = await s.person.insert({ companyId: opportunity.companyId, name: input.name.trim(), title: input.title, linkedinUrl: input.linkedinUrl, email: input.email, notesMd: input.notesMd })`.
5. `link = await s.opportunityPerson.link({ opportunityId, personId: person.id, role: input.role, stageId: input.stageId ?? null })`.
6. Return `ok({ linkId: link.id, personId: person.id })`.
- Error codes: `not_found`, `invalid` (bad shape, or a `stageId` not belonging to this opportunity).

`updateLinkedPerson(s, opportunityId, linkId, input): Promise<Result<null, "not_found" | "invalid">>`
1. Validate `input` with `personInputSchema.safeParse`; on failure, `fail("invalid", ...)`.
2. `links = await s.opportunityPerson.listForOpportunity(opportunityId)`; `link = links.find((l) => l.linkId === linkId)`; not found is `fail("not_found")` (this is also how a wrong-tenant `opportunityId` or `linkId` from a different opportunity surfaces).
3. If `input.stageId` is present: `stages = await s.stage.listForOpportunity(opportunityId)`; not found among them is `fail("invalid")`.
4. `await s.person.update(link.person.id, { name: input.name.trim(), title: input.title, linkedinUrl: input.linkedinUrl, email: input.email, notesMd: input.notesMd })`.
5. `await s.opportunityPerson.update(linkId, { role: input.role, stageId: input.stageId ?? null })`.
6. Return `ok(null)`.
- Error codes: `not_found`, `invalid`.

`unlinkPerson(s, opportunityId, linkId): Promise<Result<null, "not_found">>`
1. `links = await s.opportunityPerson.listForOpportunity(opportunityId)`; not found among them is `fail("not_found")`.
2. `await s.opportunityPerson.unlink(linkId)`.
3. Return `ok(null)`.
- Error codes: `not_found`.

All three live in `lib/people/index.ts`.

- [ ] **Step 17: Implement `lib/people/index.ts`, run the tests, confirm they pass**

```bash
pnpm exec vitest run tests/integration/people.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 18: Write the failing read-model test**

Create `tests/integration/pipeline-read.test.ts`:

```typescript
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
```

- [ ] **Step 19: Run it, confirm it fails, then write `getJobView`'s algorithm**

```bash
pnpm exec vitest run tests/integration/pipeline-read.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/read'`.

`getJobView(s, slug): Promise<JobView | null>`
1. `opportunity = await s.opportunity.getBySlug(slug)`; `null` in, `null` out.
2. `company = await s.company.getById(opportunity.companyId)!` (always present: every opportunity's `companyId` points at a company row owned by the same user, enforced by the composite foreign key from Task 1).
3. `stages = await s.stage.listForOpportunity(opportunity.id)`.
4. `currentStage = stages.find((st) => st.id === opportunity.currentStageId)!` (same non-null reasoning as `loadState`, Task 4 Step 5).
5. `people = await s.opportunityPerson.listForOpportunity(opportunity.id)`.
6. `events = await s.event.listForOpportunity(opportunity.id)`.
7. Return `{ opportunity, company, stages, currentStage, people, events }`.
- Not wrapped in `Result`: the frame's signature returns `JobView | null` directly, matching `s.opportunity.getBySlug` itself; there is nothing here that can be "invalid" input, only "found" or "not found".

Create `lib/pipeline/read.ts` with the `JobView` type from the Interfaces block above and this function.

- [ ] **Step 20: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/integration/pipeline-read.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 2 passed (2)`.

- [ ] **Step 21: Write the failing `placeOpportunity` tests**

Create `tests/integration/pipeline-place.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, stageIdsByKind } from "../helpers/opportunity-fixture";
import { placeOpportunity } from "@/lib/pipeline/place";
import { expectOk, expectFail } from "../helpers/result";

const NOW = new Date("2026-09-19T15:00:00.000Z");
const APPLIED_AT = new Date("2026-09-10T09:00:00.000Z");

describe("placeOpportunity", () => {
  it("writes no event for saved", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const before = await s.event.listForOpportunity(id);

      expectOk(await placeOpportunity(s, id, "saved", { appliedAt: APPLIED_AT, now: NOW }));

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length);
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.currentStageId).toBe(byKind.saved);
    } finally {
      await close();
    }
  });

  it("applied with an appliedAt gives one stage_moved event whose time and the Applied stage's enteredAt equal appliedAt", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const before = await s.event.listForOpportunity(id);

      expectOk(await placeOpportunity(s, id, "applied", { appliedAt: APPLIED_AT, now: NOW }));

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].kind).toBe("stage_moved");
      expect(after[0].occurredAt).toEqual(APPLIED_AT);

      const stages = await s.stage.listForOpportunity(id);
      const applied = stages.find((st) => st.id === byKind.applied)!;
      expect(applied.enteredAt).toEqual(APPLIED_AT);
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.currentStageId).toBe(byKind.applied);
    } finally {
      await close();
    }
  });

  it("a farther kind gives exactly two stage_moved events, leaves Applied done with enteredAt at appliedAt, skips the stages in between, and makes the target current", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const before = await s.event.listForOpportunity(id);

      expectOk(await placeOpportunity(s, id, "portfolio_case", { appliedAt: APPLIED_AT, now: NOW }));

      const after = await s.event.listForOpportunity(id);
      expect(after.filter((e) => e.kind === "stage_moved")).toHaveLength(2);
      expect(after).toHaveLength(before.length + 2);

      const stages = await s.stage.listForOpportunity(id);
      const applied = stages.find((st) => st.id === byKind.applied)!;
      expect(applied.status).toBe("done");
      expect(applied.enteredAt).toEqual(APPLIED_AT);
      expect(stages.find((st) => st.id === byKind.recruiter_screen)?.status).toBe("skipped");
      expect(stages.find((st) => st.id === byKind.hiring_manager)?.status).toBe("skipped");

      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.currentStageId).toBe(byKind.portfolio_case);
    } finally {
      await close();
    }
  });

  it("returns not_found for user B on user A's opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await placeOpportunity(b, id, "applied", { appliedAt: APPLIED_AT, now: NOW }), "not_found");
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 22: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/pipeline-place.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/place'`.

- [ ] **Step 23: Write `placeOpportunity`'s algorithm**

`placeOpportunity(s: Scoped, opportunityId: string, kind: StageKind, options?: { appliedAt?: Date; now?: Date }): Promise<Result<null, MoveError>>`
1. `kind === "saved"` returns `ok(null)` and writes nothing.
2. Otherwise `resolvedNow = options?.now ?? new Date()`.
3. `appliedAt = options?.appliedAt ?? resolvedNow`.
4. `applied = await moveOpportunity(s, opportunityId, { kind: "applied" }, appliedAt)` (`lib/pipeline/move.ts`, Task 4); this is what gives the Applied stage `enteredAt = appliedAt` and makes its `stage_moved` event carry that same time. `!applied.ok` returns `applied` unchanged.
5. `kind === "applied"` returns `ok(null)`: the call in Step 4 already put the job where it belongs.
6. Otherwise `further = await moveOpportunity(s, opportunityId, { kind }, resolvedNow)`; `!further.ok` returns `further` unchanged.
7. Return `ok(null)`.
- Edge case: the frame's own words explain the two-call shape: "A job that sits at the recruiter screen was applied to first, so jumping there straight from Saved would mark Applied as skipped, which is wrong." Routing every placement through Applied first is what keeps that history truthful, even when the job is really further along by the time it is added.
- Error codes: `MoveError` (`closed`, `not_found`, `same_stage`, `same_column`), all returned unchanged from whichever `moveOpportunity` call fails first; a wrong-tenant `opportunityId` is `not_found` at Step 4, the same way Task 4's functions report it.

Create `lib/pipeline/place.ts` with this function. It is the only way the add dialog (Task 8) and the import (Task 12) place a job; the seed (Task 13) uses it too.

- [ ] **Step 24: Implement `lib/pipeline/place.ts`, run the tests, confirm they pass**

```bash
pnpm exec vitest run tests/integration/pipeline-place.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 4 passed (4)`.

- [ ] **Step 25: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0, with the full suite (all five tasks in this part) green.

- [ ] **Step 26: Commit**

```bash
git add lib/pipeline/next-action.ts lib/pipeline/notes.ts lib/pipeline/schedule.ts lib/pipeline/details.ts lib/people/index.ts lib/pipeline/read.ts lib/pipeline/place.ts tests/integration/pipeline-next-action.test.ts tests/integration/pipeline-notes.test.ts tests/integration/pipeline-schedule.test.ts tests/integration/pipeline-details.test.ts tests/integration/people.test.ts tests/integration/pipeline-read.test.ts tests/integration/pipeline-place.test.ts
git commit -m "$(cat <<'EOF'
feat: add next action, notes, scheduling, details, people, the job read model and placeOpportunity

EOF
)"
```

---
