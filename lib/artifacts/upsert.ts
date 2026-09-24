import type { Scoped, ArtifactScopeRef, OpportunityRow, StageRow } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { parseKind, kindInfo, type ArtifactKind } from "@/lib/artifacts/kinds";
import { matchStageRef } from "@/lib/artifacts/stage-ref";
import { deriveTitle, normalizeBody, hashBody, utf8Bytes } from "@/lib/artifacts/normalize";
import { planUpsert } from "@/lib/artifacts/plan";
import { warningMessage, type ArtifactScope, type ArtifactWarning, type UpsertStatus } from "@/lib/artifacts/values";
import { KEY_PATTERN, MAX_ARTIFACT_BYTES } from "@/lib/bridge/wire";

export type StageInput = { ref: string } | { id: string } | null;
export type IncomingArtifact = { key: string; kind: string; title: string | null; scope: ArtifactScope; stage: StageInput; bodyMd: string };
export type UpsertResult = { key: string; scope: ArtifactScope; status: UpsertStatus; version: number };
export type UpsertOutcome = { results: UpsertResult[]; warnings: ArtifactWarning[] };

// The caller already holds the opportunity lock (it always calls this from
// inside its own transaction, right after `tx.opportunity.lockById`). This
// function locks the company row itself, the first time it is about to write
// a company-scoped artifact, and only once for the whole call.
export async function applyUpserts(
  tx: Scoped,
  context: { opportunity: OpportunityRow; stages: StageRow[] },
  inputs: IncomingArtifact[],
  options: { origin: "pushed" | "pasted" | "generated"; dryRun: boolean; now: Date },
): Promise<UpsertOutcome> {
  const results: UpsertResult[] = [];
  const warnings: ArtifactWarning[] = [];
  const changed: UpsertResult[] = [];
  let companyLocked = false;

  async function lockCompanyOnce(scope: ArtifactScope) {
    if (scope === "company" && !companyLocked) {
      await tx.company.lockById(context.opportunity.companyId);
      companyLocked = true;
    }
  }

  for (const input of inputs) {
    let kind: ArtifactKind;
    const parsedKind = parseKind(input.kind);
    if (parsedKind) {
      kind = parsedKind;
    } else {
      kind = "other";
      warnings.push({
        key: input.key,
        code: "unknown_kind",
        message: warningMessage("unknown_kind", input.key, { kind: input.kind }),
      });
    }

    let scope = input.scope;
    if (scope === "company" && !kindInfo(kind).companyWide) {
      scope = "opportunity";
      warnings.push({
        key: input.key,
        code: "company_scope_not_allowed",
        message: warningMessage("company_scope_not_allowed", input.key, {}),
      });
    }

    let stageId: string | null = null;
    const stageInput = input.stage;
    if (stageInput) {
      if (scope === "company") {
        const stageText = "ref" in stageInput ? stageInput.ref : stageInput.id;
        warnings.push({
          key: input.key,
          code: "stage_ignored",
          message: warningMessage("stage_ignored", input.key, { stage: stageText }),
        });
      } else if ("ref" in stageInput) {
        const matched = matchStageRef(context.stages, stageInput.ref);
        if (matched) {
          stageId = matched;
        } else {
          warnings.push({
            key: input.key,
            code: "stage_not_found",
            message: warningMessage("stage_not_found", input.key, { stage: stageInput.ref }),
          });
        }
      } else {
        const found = context.stages.find((st) => st.id === stageInput.id);
        if (found) {
          stageId = found.id;
        } else {
          warnings.push({
            key: input.key,
            code: "stage_not_found",
            message: warningMessage("stage_not_found", input.key, { stage: stageInput.id }),
          });
        }
      }
    }

    const title = deriveTitle({ title: input.title, bodyMd: input.bodyMd, key: input.key });
    const normalized = normalizeBody(input.bodyMd);
    const hash = hashBody(normalized);

    const ref: ArtifactScopeRef =
      scope === "opportunity" ? { opportunityId: context.opportunity.id } : { companyId: context.opportunity.companyId };
    const versions = await tx.artifact.listVersions(ref, input.key);
    const plan = planUpsert(versions, { origin: options.origin, kind, title, stageId, bodyMd: normalized, hash }, options.now);

    if (plan.status === "unchanged" && plan.warning === "sent_locked") {
      warnings.push({
        key: input.key,
        code: "sent_locked",
        message: warningMessage("sent_locked", input.key, { version: versions[versions.length - 1].version }),
      });
    }

    let version: number;
    switch (plan.status) {
      case "created":
      case "versioned": {
        if (!options.dryRun) {
          await lockCompanyOnce(scope);
          await tx.artifact.insert({
            opportunityId: scope === "opportunity" ? context.opportunity.id : null,
            companyId: scope === "company" ? context.opportunity.companyId : null,
            stageId: plan.insert.stageId,
            key: input.key,
            version: plan.insert.version,
            kind: plan.insert.kind,
            title: plan.insert.title,
            bodyMd: plan.insert.bodyMd,
            contentHash: plan.insert.contentHash,
            sourceHash: plan.insert.sourceHash,
            origin: plan.insert.origin,
            editedAt: plan.insert.editedAt,
          });
        }
        version = plan.insert.version;
        break;
      }
      case "updated": {
        if (!options.dryRun) {
          await lockCompanyOnce(scope);
          await tx.artifact.update(versions[versions.length - 1].id, plan.patch);
        }
        version = versions[versions.length - 1].version;
        break;
      }
      case "edited": {
        if (!options.dryRun) {
          await lockCompanyOnce(scope);
          await tx.artifact.update(plan.id, plan.patch);
        }
        version = versions[versions.length - 1].version;
        break;
      }
      case "unchanged": {
        version = versions[versions.length - 1].version;
        break;
      }
    }

    const result: UpsertResult = { key: input.key, scope, status: plan.status, version };
    results.push(result);
    if (plan.status !== "unchanged") {
      changed.push(result);
    }
  }

  if (!options.dryRun && (options.origin === "pushed" || options.origin === "generated") && changed.length > 0) {
    await tx.event.insert({
      opportunityId: context.opportunity.id,
      kind: "artifact_pushed",
      occurredAt: options.now,
      meta: { items: changed },
    });
  }

  return { results, warnings };
}

export async function upsertArtifacts(
  s: Scoped,
  opportunityId: string,
  inputs: IncomingArtifact[],
  options: { origin: "pushed" | "pasted" | "generated"; dryRun?: boolean; now?: Date },
): Promise<Result<UpsertOutcome, "not_found" | "invalid">> {
  const resolvedNow = options.now ?? new Date();

  return s.transaction(async (tx) => {
    const opportunity = await tx.opportunity.lockById(opportunityId);
    if (!opportunity) {
      return fail("not_found", "This job no longer exists.");
    }

    const stages = await tx.stage.listForOpportunity(opportunityId);

    const seenKeys = new Set<string>();
    for (const input of inputs) {
      if (!KEY_PATTERN.test(input.key)) {
        return fail("invalid", `"${input.key}" is not a valid document key.`);
      }
      if (normalizeBody(input.bodyMd).length === 0) {
        return fail("invalid", `${input.key}: paste some markdown.`);
      }
      if (utf8Bytes(input.bodyMd) > MAX_ARTIFACT_BYTES) {
        return fail("invalid", `${input.key}: keep the markdown under 1 MB.`);
      }
      if (seenKeys.has(input.key)) {
        return fail("invalid", `"${input.key}" is listed more than once.`);
      }
      seenKeys.add(input.key);
    }

    const outcome = await applyUpserts(tx, { opportunity, stages }, inputs, {
      origin: options.origin,
      dryRun: options.dryRun ?? false,
      now: resolvedNow,
    });
    return ok(outcome);
  });
}
