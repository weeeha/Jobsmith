import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { companyNameKey } from "@/lib/companies/name-key";
import { baseSlug, uniqueSlug } from "@/lib/pipeline/slug";
import { defaultStages } from "@/lib/pipeline/rules";
import { createOpportunitySchema } from "@/lib/pipeline/create-schema";
import type { WorkMode, OpportunitySource } from "@/lib/pipeline/values";

export type CreateOpportunityInput = {
  companyName: string;
  roleTitle: string;
  location?: string;
  workMode?: WorkMode;
  sourceUrl?: string;
  postingText?: string;
  compMin?: number;
  compMax?: number;
  compCurrency?: string;
  compNote?: string;
  myAsk?: string;
  source?: OpportunitySource;
};

export async function createOpportunity(
  s: Scoped,
  input: CreateOpportunityInput,
  now?: Date,
): Promise<Result<{ id: string; slug: string }, "invalid" | "duplicate">> {
  const parsed = createOpportunitySchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid", parsed.error.issues[0]?.message ?? "That is not valid.");
  }

  const resolvedNow = now ?? new Date();
  const key = companyNameKey(input.companyName);

  return s.transaction(async (tx) => {
    let company = await tx.company.findByNameKey(key);
    if (!company) {
      company = await tx.company.insert({ name: input.companyName.trim(), nameKey: key, tracked: false });
    }

    const existing = await tx.opportunity.findByCompanyAndRole(company.id, input.roleTitle.trim());
    if (existing && existing.status === "active") {
      return fail("duplicate", "You already have an active job for this company and role.");
    }

    const base = baseSlug(company.name, input.roleTitle.trim());
    const taken = await tx.opportunity.listSlugsWithPrefix(base);
    const slug = uniqueSlug(base, taken);

    const opportunity = await tx.opportunity.insert({
      companyId: company.id,
      slug,
      roleTitle: input.roleTitle.trim(),
      location: input.location?.trim(),
      workMode: input.workMode,
      source: input.source ?? "manual",
      sourceUrl: input.sourceUrl,
      postingMd: input.postingText ?? null,
      postingCapturedAt: input.postingText ? resolvedNow : null,
      compMin: input.compMin,
      compMax: input.compMax,
      compCurrency: input.compCurrency,
      compNote: input.compNote,
      myAsk: input.myAsk,
      currentStageId: null,
    });

    const drafts = defaultStages();
    const stageRows = await tx.stage.insertMany(
      drafts.map((d, i) => ({ opportunityId: opportunity.id, kind: d.kind, label: d.label, position: i })),
    );

    const savedStage = stageRows.find((r) => r.kind === "saved")!;
    await tx.stage.update(savedStage.id, { enteredAt: resolvedNow });
    await tx.opportunity.update(opportunity.id, { currentStageId: savedStage.id });
    await tx.event.insert({
      opportunityId: opportunity.id,
      kind: "created",
      occurredAt: resolvedNow,
      meta: {},
    });

    return ok({ id: opportunity.id, slug: opportunity.slug });
  });
}
