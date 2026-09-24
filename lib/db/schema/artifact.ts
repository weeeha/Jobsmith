import { pgTable, text, uuid, integer, timestamp, foreignKey, unique, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { company, opportunity, stage } from "./pipeline";
import { ARTIFACT_KIND_VALUES } from "@/lib/artifacts/kinds";
import { ARTIFACT_ORIGINS } from "@/lib/artifacts/values";

export const artifact = pgTable(
  "artifact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id"),
    companyId: uuid("company_id"),
    stageId: uuid("stage_id").references(() => stage.id, { onDelete: "set null" }),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    kind: text("kind", { enum: ARTIFACT_KIND_VALUES }).notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    contentHash: text("content_hash").notNull(),
    sourceHash: text("source_hash"),
    origin: text("origin", { enum: ARTIFACT_ORIGINS }).notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("artifact_user_id_id_unique").on(t.userId, t.id),
    uniqueIndex("artifact_opportunity_key_version_unique")
      .on(t.opportunityId, t.key, t.version)
      .where(sql`${t.opportunityId} is not null`),
    uniqueIndex("artifact_company_key_version_unique")
      .on(t.companyId, t.key, t.version)
      .where(sql`${t.companyId} is not null`),
    foreignKey({
      name: "artifact_opportunity_fk",
      columns: [t.userId, t.opportunityId],
      foreignColumns: [opportunity.userId, opportunity.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "artifact_company_fk",
      columns: [t.userId, t.companyId],
      foreignColumns: [company.userId, company.id],
    }).onDelete("cascade"),
    check("artifact_scope_check", sql`(${t.opportunityId} is null) <> (${t.companyId} is null)`),
    check("artifact_company_stage_check", sql`${t.companyId} is null or ${t.stageId} is null`),
    check("artifact_version_check", sql`${t.version} >= 1`),
    check(
      "artifact_kind_check",
      sql`${t.kind} in ('research', 'fit_brief', 'people_notes', 'cv', 'cover_letter', 'message_draft', 'question_bank', 'call_card', 'pitch', 'glossary', 'debrief', 'other')`,
    ),
    check("artifact_origin_check", sql`${t.origin} in ('pushed', 'pasted', 'manual', 'generated')`),
  ],
);
