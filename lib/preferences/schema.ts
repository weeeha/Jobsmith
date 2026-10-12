import { z } from "zod";
import { WORK_MODES } from "@/lib/pipeline/values";

export const PREFERENCES_VERSION = 1;

export const SENIORITY_LEVELS = ["junior", "mid", "senior", "lead", "principal", "director"] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number];
export const SENIORITY_LABELS: Record<Seniority, string> = {
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead",
  principal: "Principal",
  director: "Director",
};

export const MAX_LIST_ITEMS = 20;
export const MAX_ITEM_CHARS = 80;
// Pay is stored in an integer column.
const MAX_PAY = 2_147_483_647;

export const PREFERENCE_LISTS = ["titles", "locations", "mustHaves", "dealbreakers", "industriesAvoid"] as const;
export type PreferenceList = (typeof PREFERENCE_LISTS)[number];

const listItem = z
  .string()
  .trim()
  .min(1, "Remove the empty entry.")
  .max(MAX_ITEM_CHARS, "Keep each entry under 80 characters.");

// Entries that differ only in case are one entry; the later spelling is kept.
const list = z
  .array(listItem)
  .max(MAX_LIST_ITEMS, "Keep the list to 20 entries.")
  .transform((items) => [...new Map(items.map((item) => [item.toLowerCase(), item])).values()]);

const pay = z
  .number({ error: "Enter a number." })
  .int("Enter a whole number.")
  .min(0, "Enter 0 or more.")
  .max(MAX_PAY, "Enter a smaller number.")
  .nullable();

const size = z
  .number({ error: "Enter a number." })
  .int("Enter a whole number.")
  .min(1, "Enter 1 or more.")
  .max(1_000_000, "Enter a smaller number.")
  .nullable()
  .default(null);

const companySizeSchema = z
  .object({ min: size, max: size })
  .refine((value) => value.min === null || value.max === null || value.min <= value.max, {
    message: "The smallest size must not be above the largest.",
    path: ["max"],
  });

const days = z
  .number({ error: "Enter a number." })
  .int("Enter a whole number.")
  .min(1, "Enter 1 to 60.")
  .max(60, "Enter 1 to 60.");

const attentionSchema = z.object({
  followUpDays: days.default(7),
  savedDays: days.default(3),
});

export const preferencesSchema = z.object({
  v: z.literal(1).default(1),
  titles: list.default([]),
  seniority: z.array(z.enum(SENIORITY_LEVELS)).max(SENIORITY_LEVELS.length).default([]),
  locations: list.default([]),
  workModes: z.array(z.enum(WORK_MODES)).max(WORK_MODES.length).default([]),
  compFloor: pay.default(null),
  compTarget: pay.default(null),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Enter a three-letter code such as EUR.")
    .nullable()
    .default(null),
  mustHaves: list.default([]),
  dealbreakers: list.default([]),
  industriesAvoid: list.default([]),
  companySize: companySizeSchema.default({ min: null, max: null }),
  scoreThreshold: z
    .number({ error: "Enter a number." })
    .int("Enter a whole number.")
    .min(0, "Enter 0 to 100.")
    .max(100, "Enter 0 to 100.")
    .default(70),
  attention: attentionSchema.default({ followUpDays: 7, savedDays: 3 }),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});

// Stored data must never crash a page: when the whole document fails, each
// top-level field is parsed on its own and a failing one falls back to its
// default while the rest are kept.
export function parsePreferences(raw: unknown): Preferences {
  const whole = preferencesSchema.safeParse(raw);
  if (whole.success) return whole.data;
  const source = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(preferencesSchema.shape)) {
    const parsed = (field as z.ZodType).safeParse(source[key]);
    out[key] = parsed.success ? parsed.data : (DEFAULT_PREFERENCES as Record<string, unknown>)[key];
  }
  return out as Preferences;
}

// The preferences that flag a job in code (the others only feed the score).
export function hasHardFilters(p: Preferences): boolean {
  return p.titles.length > 0 || p.locations.length > 0 || p.workModes.length > 0 || p.compFloor !== null;
}
