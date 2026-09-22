import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { WORK_MODES } from "@/lib/pipeline/values";
import type { CreateOpportunityInput } from "@/lib/pipeline/create";

export const updateOpportunityDetailsSchema = z
  .object({
    roleTitle: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1).optional(),
    workMode: z.enum(WORK_MODES).optional(),
    sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
    compMin: z.number().int().nonnegative().optional(),
    compMax: z.number().int().nonnegative().optional(),
    compCurrency: z.string().trim().min(1).optional(),
    compNote: z.string().optional(),
    myAsk: z.string().optional(),
  })
  .refine((v) => v.compMin === undefined || v.compMax === undefined || v.compMin <= v.compMax, {
    message: "compMin must be less than or equal to compMax",
    path: ["compMax"],
  });

export const updateCompanyDetailsSchema = z.object({
  domain: z.string().trim().min(1).optional(),
  careersUrl: z.url({ protocol: /^https?$/ }).optional(),
  size: z.string().trim().min(1).optional(),
  industry: z.string().trim().min(1).optional(),
  hq: z.string().trim().min(1).optional(),
  notesMd: z.string().optional(),
});

export async function updateOpportunityDetails(
  s: Scoped,
  opportunityId: string,
  input: Partial<
    Pick<
      CreateOpportunityInput,
      "roleTitle" | "location" | "workMode" | "sourceUrl" | "compMin" | "compMax" | "compCurrency" | "compNote" | "myAsk"
    >
  >,
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
