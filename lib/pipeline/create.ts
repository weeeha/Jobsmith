import { DrizzleQueryError } from "drizzle-orm";
import type { OpportunityRow, Scoped } from "@/lib/db/scoped";
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

// The slug handed to insert() below is allocated from a pre-commit read
// (listSlugsWithPrefix), so two concurrent creates can compute the same
// slug; the loser's insert then violates this constraint instead of the
// findByCompanyAndRole check above catching it. node-postgres (prod) and
// PGlite (tests) both speak the Postgres wire protocol, so either surfaces
// the same way: drizzle-orm wraps the driver's error in a DrizzleQueryError,
// with the original Postgres error (code 23505 = unique_violation, plus
// which named constraint fired) on `.cause`. Verified empirically against
// PGlite in this repo (see the task-4 fix report).
const SLUG_UNIQUE_CONSTRAINT = "opportunity_user_slug_unique";

function isSlugCollision(err: unknown): boolean {
  if (!(err instanceof DrizzleQueryError)) return false;
  const cause = err.cause as { code?: string; constraint?: string } | undefined;
  return cause?.code === "23505" && cause?.constraint === SLUG_UNIQUE_CONSTRAINT;
}

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

    let opportunity: OpportunityRow;
    try {
      opportunity = await tx.opportunity.insert({
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
        compCurrency: input.compCurrency?.trim(),
        compNote: input.compNote,
        myAsk: input.myAsk,
        currentStageId: null,
      });
    } catch (err) {
      if (isSlugCollision(err)) {
        return fail("duplicate", "You already have an active job for this company and role.");
      }
      throw err;
    }

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
