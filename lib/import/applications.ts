import { z } from "zod";
import { STAGE_KIND_VALUES } from "@/lib/pipeline/values";
import type { Result } from "@/lib/result";
import { ok, fail } from "@/lib/result";
import type { Scoped } from "@/lib/db/scoped";
import { companyNameKey } from "@/lib/companies/name-key";
import { createOpportunity } from "@/lib/pipeline/create";
import { placeOpportunity } from "@/lib/pipeline/place";
import { addNote } from "@/lib/pipeline/notes";
import { setNextAction } from "@/lib/pipeline/next-action";

export const importEntrySchema = z.object({
  company: z.string().trim().min(1),
  roleTitle: z.string().trim().min(1),
  stageKind: z.enum(STAGE_KIND_VALUES),
  // Deliberately loose: a non-empty string, not a strict date format. An
  // appliedAt that does not parse as a real date fails per entry, by index,
  // inside importApplications. It must not reject the whole file here, or
  // one bad date would silently take seven good entries with it.
  appliedAt: z.string().trim().min(1).optional(),
  sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
  notes: z.string().trim().min(1).optional(),
  nextAction: z.string().trim().min(1).optional(),
});

export type ImportEntry = z.infer<typeof importEntrySchema>;

const importEntriesSchema = z.array(importEntrySchema);

export type ImportFailure = { index: number; message: string };
export type ImportSummary = { created: number; skipped: number; failed: ImportFailure[] };

export function parseApplications(json: unknown): Result<ImportEntry[], "invalid"> {
  const parsed = importEntriesSchema.safeParse(json);
  if (!parsed.success) {
    return fail("invalid", parsed.error.issues[0]?.message ?? "The file is not a valid import list.");
  }
  return ok(parsed.data);
}

// D14: an entry already tracked for this user — same company, same role,
// in any status — is skipped rather than replayed, so a job the owner
// imported and later closed does not come back as a new active job the
// next time the same file runs. createOpportunity only treats an ACTIVE
// match as a duplicate (it lets the owner knowingly re-apply to a role
// they closed out), so that check is not enough on its own here.
async function findExisting(s: Scoped, entry: ImportEntry) {
  const company = await s.company.findByNameKey(companyNameKey(entry.company));
  if (!company) return null;
  return s.opportunity.findByCompanyAndRole(company.id, entry.roleTitle);
}

// A bad appliedAt fails only its own entry, by index, and is checked before
// anything else runs for that entry (real or dry run) so neither path ever
// hands an Invalid Date to placeOpportunity.
function parseAppliedAt(entry: ImportEntry): { ok: true; date: Date | undefined } | { ok: false; message: string } {
  if (!entry.appliedAt) return { ok: true, date: undefined };
  const date = new Date(entry.appliedAt);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: "appliedAt is not a date this importer understands." };
  }
  return { ok: true, date };
}

async function importReal(s: Scoped, entries: ImportEntry[]): Promise<ImportSummary> {
  const now = new Date();
  let created = 0;
  let skipped = 0;
  const failed: ImportFailure[] = [];

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;

    const appliedAt = parseAppliedAt(entry);
    if (!appliedAt.ok) {
      failed.push({ index, message: appliedAt.message });
      continue;
    }

    if ((await findExisting(s, entry)) !== null) {
      skipped += 1;
      continue;
    }

    const createResult = await createOpportunity(
      s,
      { companyName: entry.company, roleTitle: entry.roleTitle, sourceUrl: entry.sourceUrl },
      now,
    );
    if (!createResult.ok) {
      if (createResult.code === "duplicate") {
        skipped += 1;
      } else {
        failed.push({ index, message: createResult.message });
      }
      continue;
    }

    created += 1;
    const id = createResult.data.id;

    const placeResult = await placeOpportunity(s, id, entry.stageKind, { appliedAt: appliedAt.date, now });
    if (!placeResult.ok) {
      failed.push({ index, message: placeResult.message });
    }

    if (entry.notes) {
      const noteResult = await addNote(s, id, entry.notes, now);
      if (!noteResult.ok) {
        failed.push({ index, message: noteResult.message });
      }
    }

    if (entry.nextAction) {
      const nextActionResult = await setNextAction(s, id, { text: entry.nextAction, at: null });
      if (!nextActionResult.ok) {
        failed.push({ index, message: nextActionResult.message });
      }
    }
  }

  return { created, skipped, failed };
}

// No transaction, no writes, no rollback to reason about: createOpportunity
// and placeOpportunity each open their own transaction internally (one or
// two, depending on the stage), and nesting a dry run's own outer
// transaction around them would depend on the driver turning those inner
// ones into savepoints. This path only reads, so there is nothing to undo.
async function importDryRun(s: Scoped, entries: ImportEntry[]): Promise<ImportSummary> {
  let created = 0;
  let skipped = 0;
  const failed: ImportFailure[] = [];
  // Duplicates within the same file are never written, so a database lookup
  // alone would miss a second entry that repeats an earlier one; this set
  // catches that case, matching what the real run's committed rows would
  // already have caught by the time the second entry is checked.
  const seen = new Set<string>();

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;

    const appliedAt = parseAppliedAt(entry);
    if (!appliedAt.ok) {
      failed.push({ index, message: appliedAt.message });
      continue;
    }

    const key = `${companyNameKey(entry.company)}::${entry.roleTitle.trim().toLowerCase()}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }

    if ((await findExisting(s, entry)) !== null) {
      skipped += 1;
      seen.add(key);
      continue;
    }

    created += 1;
    seen.add(key);
  }

  return { created, skipped, failed };
}

export function importApplications(
  s: Scoped,
  entries: ImportEntry[],
  options: { dryRun: boolean },
): Promise<ImportSummary> {
  return options.dryRun ? importDryRun(s, entries) : importReal(s, entries);
}
