import { z } from "zod";
import { WORK_MODES, STAGE_KIND_VALUES } from "@/lib/pipeline/values";
import { MAX_LINK_CHARS, MAX_POSTING_CHARS, VIAS, EXTRACTIONS } from "./values";
import type { ResolvedPosting } from "./resolve";

const MAX_COMP = 2_147_483_647;
const compFigureSchema = z
  .number({ error: "Enter a number." })
  .int("Enter a whole number.")
  .nonnegative("Enter a number that is zero or more.")
  .max(MAX_COMP, `Enter a number no greater than ${MAX_COMP.toLocaleString("en-US")}.`);

export const addJobFormSchema = z
  .object({
    sourceUrl: z
      .url({ protocol: /^https?$/, error: "Enter a link that starts with http or https." })
      .max(MAX_LINK_CHARS, "Keep the link under 2,048 characters.")
      .optional(),
    postingText: z.string().max(MAX_POSTING_CHARS, "Keep the posting text under 100,000 characters.").optional(),
    companyName: z.string().trim().min(1, "Enter a company name.").optional(),
    roleTitle: z.string().trim().min(1, "Enter a role.").optional(),
    location: z.string().trim().min(1, "Enter a location.").optional(),
    workMode: z.enum(WORK_MODES, { error: "Choose a work mode." }).optional(),
    compMin: compFigureSchema.optional(),
    compMax: compFigureSchema.optional(),
    compCurrency: z.string().trim().min(1, "Enter a currency.").optional(),
    compNote: z.string().optional(),
    myAsk: z.string().optional(),
    whereIsItNow: z.enum(STAGE_KIND_VALUES, { error: "Choose a stage from the list." }).optional(),
    draft: z.string().optional(),
    intent: z.enum(["add", "add_anyway"], { error: "That is not a valid choice." }).optional(),
  })
  .refine((v) => v.compMin === undefined || v.compMax === undefined || v.compMin <= v.compMax, {
    message: "Pay to must be at least pay from.",
    path: ["compMax"],
  });
export type AddJobForm = z.infer<typeof addJobFormSchema>;

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value;
}

function toNumberOrUndefined(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return Number(value);
}

export function readAddJobForm(formData: FormData): Record<string, unknown> {
  return {
    sourceUrl: emptyToUndefined(formData.get("sourceUrl")),
    postingText: emptyToUndefined(formData.get("postingText")),
    companyName: emptyToUndefined(formData.get("companyName")),
    roleTitle: emptyToUndefined(formData.get("roleTitle")),
    location: emptyToUndefined(formData.get("location")),
    workMode: emptyToUndefined(formData.get("workMode")),
    compMin: toNumberOrUndefined(formData.get("compMin")),
    compMax: toNumberOrUndefined(formData.get("compMax")),
    compCurrency: emptyToUndefined(formData.get("compCurrency")),
    compNote: emptyToUndefined(formData.get("compNote")),
    myAsk: emptyToUndefined(formData.get("myAsk")),
    whereIsItNow: emptyToUndefined(formData.get("whereIsItNow")),
    draft: emptyToUndefined(formData.get("draft")),
    intent: emptyToUndefined(formData.get("intent")),
  };
}

export const intakeDraftSchema = z.object({
  v: z.literal(1),
  source: z.enum(["url", "text"]),
  via: z.enum(VIAS),
  sourceUrl: z
    .url({ protocol: /^https?$/ })
    .max(MAX_LINK_CHARS)
    .nullable(),
  bodyMd: z.string().max(MAX_POSTING_CHARS),
  fields: z.object({
    companyName: z.string().nullable(),
    roleTitle: z.string().nullable(),
    location: z.string().nullable(),
    workMode: z.enum(WORK_MODES).nullable(),
    compMin: z.number().nullable(),
    compMax: z.number().nullable(),
    compCurrency: z.string().nullable(),
  }),
  extraction: z.enum(EXTRACTIONS),
  needsReview: z.boolean(),
  ats: z.object({ kind: z.enum(["greenhouse", "ashby", "lever"]), org: z.string() }).nullable(),
});
export type IntakeDraft = z.infer<typeof intakeDraftSchema>;

export function encodeDraft(posting: ResolvedPosting): string {
  return JSON.stringify({ v: 1, ...posting });
}

export function decodeDraft(value: string | undefined): ResolvedPosting | null {
  if (value === undefined || value === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  const result = intakeDraftSchema.safeParse(parsed);
  if (!result.success) return null;
  const { v: _v, ...posting } = result.data;
  return posting;
}
