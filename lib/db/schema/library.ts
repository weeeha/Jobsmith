import { pgTable, text, uuid, jsonb, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { opportunity } from "./pipeline";
import { artifact } from "./artifact";
import { LIBRARY_KINDS } from "@/lib/prep/values";

export const libraryItem = pgTable(
  "library_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: LIBRARY_KINDS }).notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    questionKey: text("question_key"),
    sourceOpportunityId: uuid("source_opportunity_id").references(() => opportunity.id, { onDelete: "set null" }),
    sourceArtifactId: uuid("source_artifact_id").references(() => artifact.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("library_item_user_idx").on(t.userId),
    index("library_item_user_question_key_idx").on(t.userId, t.questionKey),
    // One saved answer per question and job, so two simultaneous "Save to library" clicks make one item.
    // Rows whose job was deleted (source set to null) fall out of the index.
    uniqueIndex("library_item_user_question_source_uniq")
      .on(t.userId, t.questionKey, t.sourceOpportunityId)
      .where(sql`${t.questionKey} is not null and ${t.sourceOpportunityId} is not null`),
    check("library_item_kind_check", sql`${t.kind} in ('answer', 'story', 'intro', 'fact')`),
  ],
);
