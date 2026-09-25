import { pgTable, text, uuid, integer, timestamp, unique, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const apiToken = pgTable(
  "api_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    prefix: text("prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    rateWindowStart: timestamp("rate_window_start", { withTimezone: true }),
    rateCount: integer("rate_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("api_token_token_hash_unique").on(t.tokenHash),
    index("api_token_user_idx").on(t.userId),
  ],
);
