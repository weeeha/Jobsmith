import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { WORK_MODES, type WorkMode } from "@/lib/pipeline/values";
import type { CreateOpportunityInput } from "@/lib/pipeline/create";

// Ruling 1 (Task 10): every optional field here is nullable, not just
// optional. `undefined` (the key is left out of the input) still means
// "leave this column unchanged" - the update below only ever assigns keys
// actually present on `parsed.data`. `null` is new: the Edit details
// dialog has no separate "clear" control, so a field the user blanked out
// is sent as `null` and means "clear this column", which a plain
// `.optional()` (accepting only `T | undefined`) could not express -
// blanking the field could previously only be silently ignored, never
// actually clear a previously-set value. roleTitle is deliberately left
// out of this: it has no blank/clear affordance in the UI and the column
// is NOT NULL, so it stays required-when-given and non-empty.
export const updateOpportunityDetailsSchema = z
  .object({
    roleTitle: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1).nullable().optional(),
    workMode: z.enum(WORK_MODES).nullable().optional(),
    sourceUrl: z.url({ protocol: /^https?$/ }).nullable().optional(),
    compMin: z.number().int().nonnegative().nullable().optional(),
    compMax: z.number().int().nonnegative().nullable().optional(),
    compCurrency: z.string().trim().min(1).nullable().optional(),
    compNote: z.string().nullable().optional(),
    myAsk: z.string().nullable().optional(),
  })
  .refine(
    (v) =>
      v.compMin === undefined ||
      v.compMin === null ||
      v.compMax === undefined ||
      v.compMax === null ||
      v.compMin <= v.compMax,
    { message: "compMin must be less than or equal to compMax", path: ["compMax"] },
  );

export const updateCompanyDetailsSchema = z.object({
  domain: z.string().trim().min(1).optional(),
  careersUrl: z.url({ protocol: /^https?$/ }).optional(),
  size: z.string().trim().min(1).optional(),
  industry: z.string().trim().min(1).optional(),
  hq: z.string().trim().min(1).optional(),
  notesMd: z.string().optional(),
});

export type UpdateOpportunityDetailsInput = Pick<Partial<CreateOpportunityInput>, "roleTitle"> & {
  location?: string | null;
  workMode?: WorkMode | null;
  sourceUrl?: string | null;
  compMin?: number | null;
  compMax?: number | null;
  compCurrency?: string | null;
  compNote?: string | null;
  myAsk?: string | null;
};

export async function updateOpportunityDetails(
  s: Scoped,
  opportunityId: string,
  input: UpdateOpportunityDetailsInput,
): Promise<Result<null, "not_found" | "invalid">> {
  const parsed = updateOpportunityDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid", parsed.error.issues[0]?.message ?? "That is not valid.");
  }

  const row = await s.opportunity.getById(opportunityId);
  if (!row) {
    return fail("not_found", "This job no longer exists.");
  }

  await s.opportunity.update(opportunityId, parsed.data);
  return ok(null);
}

export async function updateCompanyDetails(
  s: Scoped,
  companyId: string,
  input: { domain?: string; careersUrl?: string; size?: string; industry?: string; hq?: string; notesMd?: string },
): Promise<Result<null, "not_found" | "invalid">> {
  const parsed = updateCompanyDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid", parsed.error.issues[0]?.message ?? "That is not valid.");
  }

  const row = await s.company.getById(companyId);
  if (!row) {
    return fail("not_found", "This company no longer exists.");
  }

  await s.company.update(companyId, parsed.data);
  return ok(null);
}
