import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  unique,
  uniqueIndex,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { opportunity, stage } from "./pipeline";
import { artifact } from "./artifact";
import { MARK_LEVELS, MARK_SCOPES, PREP_MODES } from "@/lib/prep/values";
import type { ParsedBlock } from "@/lib/prep/parse";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const prepQuestion = pgTable(
  "prep_question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").notNull(),
    artifactId: uuid("artifact_id").notNull(),
    artifactVersion: integer("artifact_version").notNull(),
    artifactKey: text("artifact_key").notNull(),
    stageId: uuid("stage_id").references(() => stage.id, { onDelete: "set null" }),
    section: text("section"),
    number: integer("number").notNull(),
    position: integer("position").notNull(),
    question: text("question").notNull(),
    questionKey: text("question_key").notNull(),
    blocks: jsonb("blocks").$type<ParsedBlock[]>().notNull().default([]),
    spine: text("spine"),
    lastLine: text("last_line"),
    guard: text("guard"),
    unfilled: boolean("unfilled").notNull().default(false),
    hasAnswer: boolean("has_answer").notNull().default(false),
    unresolvedIncludes: integer("unresolved_includes").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("prep_question_artifact_position_unique").on(t.artifactId, t.position),
    index("prep_question_job_key_idx").on(t.userId, t.opportunityId, t.artifactKey),
    index("prep_question_user_question_key_idx").on(t.userId, t.questionKey),
    foreignKey({
      name: "prep_question_artifact_fk",
      columns: [t.userId, t.artifactId],
      foreignColumns: [artifact.userId, artifact.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "prep_question_opportunity_fk",
      columns: [t.userId, t.opportunityId],
      foreignColumns: [opportunity.userId, opportunity.id],
    }).onDelete("cascade"),
  ],
);

export const prepMark = pgTable(
  "prep_mark",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    scope: text("scope", { enum: MARK_SCOPES }).notNull(),
    opportunityId: uuid("opportunity_id"),
    questionKey: text("question_key").notNull(),
    level: text("level", { enum: MARK_LEVELS }).notNull(),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull(),
    drillCount: integer("drill_count").notNull().default(0),
    lastDrilledAt: timestamp("last_drilled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("prep_mark_user_idx").on(t.userId),
    uniqueIndex("prep_mark_scope_key_unique").on(
      t.userId,
      t.scope,
      sql`coalesce(${t.opportunityId}::text, '')`,
      t.questionKey,
    ),
    foreignKey({
      name: "prep_mark_opportunity_fk",
      columns: [t.userId, t.opportunityId],
      foreignColumns: [opportunity.userId, opportunity.id],
    }).onDelete("cascade"),
    check("prep_mark_scope_check", sql`${t.scope} in ('job', 'library')`),
    check("prep_mark_level_check", sql`${t.level} in ('shaky', 'okay', 'solid')`),
  ],
);

export const prepSession = pgTable(
  "prep_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id"),
    mode: text("mode", { enum: PREP_MODES }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    questions: integer("questions").notNull().default(0),
    marked: integer("marked").notNull().default(0),
    meta: jsonb("meta").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("prep_session_user_opportunity_idx").on(t.userId, t.opportunityId),
    foreignKey({
      name: "prep_session_opportunity_fk",
      columns: [t.userId, t.opportunityId],
      foreignColumns: [opportunity.userId, opportunity.id],
    }).onDelete("cascade"),
    check("prep_session_mode_check", sql`${t.mode} in ('listen', 'drill', 'quick_fire')`),
  ],
);
