import { z } from "zod";
import { WORK_MODES, type WorkMode } from "@/lib/pipeline/values";

export const PREFERENCES_VERSION = 1;

export const SENIORITY_LEVELS = [
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
  { value: "principal", label: "Principal" },
  { value: "manager", label: "Manager" },
] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number]["value"];
const SENIORITY_VALUES = SENIORITY_LEVELS.map((s) => s.value) as [Seniority, ...Seniority[]];

export const LIST_MAX_ENTRIES = 20;
export const LIST_ENTRY_MAX = 80;
export const PAY_MAX = 10_000_000;
export const COMPANY_SIZE_MAX = 1_000_000;
export const ATTENTION_DAYS_MAX = 60;

export type Preferences = {
  version: typeof PREFERENCES_VERSION;
  titles: string[];
  seniority: Seniority[];
  locations: string[];
  workModes: WorkMode[];
  compFloor: number | null;
  compTarget: number | null;
  currency: string;
  mustHaves: string[];
  dealbreakers: string[];
  industriesAvoid: string[];
  companySize: { min: number | null; max: number | null };
  scoreThreshold: number;
  attention: { followUpDays: number; savedDays: number };
};

export const DEFAULT_PREFERENCES: Preferences = {
  version: PREFERENCES_VERSION,
  titles: [],
  seniority: [],
  locations: [],
  workModes: [],
  compFloor: null,
  compTarget: null,
  currency: "USD",
  mustHaves: [],
  dealbreakers: [],
  industriesAvoid: [],
  companySize: { min: null, max: null },
  scoreThreshold: 70,
  attention: { followUpDays: 7, savedDays: 3 },
};

/** Trimmed, blanks dropped, duplicates removed without regard to case (the first spelling wins). */
export function normalizeList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value === "") continue;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

// ---------- reading a stored document (never throws) ----------

function storedInt(min: number, max: number) {
  return z.number().int().min(min).max(max);
}

const storedList = z
  .array(z.unknown())
  .transform((values) =>
    normalizeList(values.filter((v): v is string => typeof v === "string" && v.length <= LIST_ENTRY_MAX)).slice(0, LIST_MAX_ENTRIES),
  );

function storedEnumList<T extends string>(allowed: readonly T[]) {
  return z.array(z.unknown()).transform((values) => {
    const out: T[] = [];
    for (const v of values) {
      if (typeof v === "string" && (allowed as readonly string[]).includes(v) && !out.includes(v as T)) out.push(v as T);
    }
    return out;
  });
}

// Every field catches on its own, so one field written by an older version
// or edited by hand falls back to its default without dropping the rest.
const storedDocumentSchema = z.object({
  version: z.literal(PREFERENCES_VERSION).catch(PREFERENCES_VERSION),
  titles: storedList.catch([]),
  seniority: storedEnumList(SENIORITY_VALUES).catch([]),
  locations: storedList.catch([]),
  workModes: storedEnumList(WORK_MODES).catch([]),
  compFloor: storedInt(0, PAY_MAX).nullable().catch(null),
  compTarget: storedInt(0, PAY_MAX).nullable().catch(null),
  currency: z.string().regex(/^[A-Z]{3}$/).catch(DEFAULT_PREFERENCES.currency),
  mustHaves: storedList.catch([]),
  dealbreakers: storedList.catch([]),
  industriesAvoid: storedList.catch([]),
  companySize: z
    .object({
      min: storedInt(1, COMPANY_SIZE_MAX).nullable().catch(null),
      max: storedInt(1, COMPANY_SIZE_MAX).nullable().catch(null),
    })
    .catch({ ...DEFAULT_PREFERENCES.companySize }),
  scoreThreshold: storedInt(0, 100).catch(DEFAULT_PREFERENCES.scoreThreshold),
  attention: z
    .object({
      followUpDays: storedInt(1, ATTENTION_DAYS_MAX).catch(DEFAULT_PREFERENCES.attention.followUpDays),
      savedDays: storedInt(1, ATTENTION_DAYS_MAX).catch(DEFAULT_PREFERENCES.attention.savedDays),
    })
    .catch({ ...DEFAULT_PREFERENCES.attention }),
});

export function parsePreferences(raw: unknown): Preferences {
  const parsed = storedDocumentSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : structuredClone(DEFAULT_PREFERENCES);
}

// ---------- saving from the form (strict) ----------

const LIST_ENTRY_MESSAGE = "Keep each entry under 80 characters.";
const LIST_COUNT_MESSAGE = "Keep it to 20 entries or fewer.";
const PAY_MESSAGE = "Enter a whole number from 0 to 10,000,000.";
const SIZE_MESSAGE = "Enter a whole number from 1 to 1,000,000.";
const DAYS_MESSAGE = "Enter a whole number of days from 1 to 60.";
const THRESHOLD_MESSAGE = "Enter a whole number from 0 to 100.";

const inputList = z
  .array(z.string())
  .transform(normalizeList)
  .pipe(z.array(z.string().max(LIST_ENTRY_MAX, LIST_ENTRY_MESSAGE)).max(LIST_MAX_ENTRIES, LIST_COUNT_MESSAGE));

function inputInt(min: number, max: number, message: string) {
  return z.number({ error: message }).int(message).min(min, message).max(max, message);
}

export const preferencesInputSchema = z
  .object({
    titles: inputList,
    seniority: z.array(z.enum(SENIORITY_VALUES, { error: "Pick from the listed levels." })),
    locations: inputList,
    workModes: z.array(z.enum(WORK_MODES, { error: "Pick from the listed work modes." })),
    compFloor: inputInt(0, PAY_MAX, PAY_MESSAGE).nullable(),
    compTarget: inputInt(0, PAY_MAX, PAY_MESSAGE).nullable(),
    currency: z
      .string({ error: "Use a three-letter currency code, like USD." })
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use a three-letter currency code, like USD."),
    mustHaves: inputList,
    dealbreakers: inputList,
    industriesAvoid: inputList,
    sizeMin: inputInt(1, COMPANY_SIZE_MAX, SIZE_MESSAGE).nullable(),
    sizeMax: inputInt(1, COMPANY_SIZE_MAX, SIZE_MESSAGE).nullable(),
    scoreThreshold: inputInt(0, 100, THRESHOLD_MESSAGE),
    followUpDays: inputInt(1, ATTENTION_DAYS_MAX, DAYS_MESSAGE),
    savedDays: inputInt(1, ATTENTION_DAYS_MAX, DAYS_MESSAGE),
  })
  .superRefine((value, ctx) => {
    if (value.compFloor !== null && value.compTarget !== null && value.compTarget < value.compFloor) {
      ctx.addIssue({ code: "custom", path: ["compTarget"], message: "The target can't be below the floor." });
    }
    if (value.sizeMin !== null && value.sizeMax !== null && value.sizeMax < value.sizeMin) {
      ctx.addIssue({ code: "custom", path: ["sizeMax"], message: "The largest size can't be below the smallest." });
    }
  });

export type PreferencesInput = z.infer<typeof preferencesInputSchema>;

export function toPreferencesDocument(input: PreferencesInput): Preferences {
  return {
    version: PREFERENCES_VERSION,
    titles: input.titles,
    seniority: input.seniority,
    locations: input.locations,
    workModes: input.workModes,
    compFloor: input.compFloor,
    compTarget: input.compTarget,
    currency: input.currency,
    mustHaves: input.mustHaves,
    dealbreakers: input.dealbreakers,
    industriesAvoid: input.industriesAvoid,
    companySize: { min: input.sizeMin, max: input.sizeMax },
    scoreThreshold: input.scoreThreshold,
    attention: { followUpDays: input.followUpDays, savedDays: input.savedDays },
  };
}
