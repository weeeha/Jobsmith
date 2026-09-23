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
    // Circular pointer: stage is declared after opportunity, so this
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
