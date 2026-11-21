import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamp,
  index,
  unique,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { opportunity } from "./pipeline";
import { ASSET_KINDS, SEGMENT_STATUSES } from "@/lib/prep/values";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const asset = pgTable(
  "asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ASSET_KINDS }).notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    durationMs: integer("duration_ms"),
    opportunityId: uuid("opportunity_id").references(() => opportunity.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("asset_user_idx").on(t.userId),
    unique("asset_storage_key_unique").on(t.storageKey),
    unique("asset_user_id_id_unique").on(t.userId, t.id),
    check("asset_kind_check", sql`${t.kind} in ('tts_segment', 'recording', 'other')`),
  ],
);

export const ttsSegment = pgTable(
  "tts_segment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    voice: text("voice").notNull(),
    style: text("style").notNull(),
    textChars: integer("text_chars").notNull(),
    assetId: uuid("asset_id"),
    status: text("status", { enum: SEGMENT_STATUSES }).notNull().default("pending"),
    errorCode: text("error_code"),
    suspect: boolean("suspect").notNull().default(false),
    attempts: integer("attempts").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("tts_segment_user_hash_unique").on(t.userId, t.hash),
    foreignKey({
      name: "tts_segment_asset_fk",
      columns: [t.userId, t.assetId],
      foreignColumns: [asset.userId, asset.id],
    }).onDelete("cascade"),
    check("tts_segment_status_check", sql`${t.status} in ('pending', 'done', 'failed')`),
  ],
);
