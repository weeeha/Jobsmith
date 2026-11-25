import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import type { ParsedBlock } from "@/lib/prep/parse";
import { LIBRARY_COPY } from "./copy";
import { LIBRARY_TITLE_MAX, createLibraryItemOnce } from "./items";

function blockText(blocks: ParsedBlock[], label: string): string | null {
  const found = blocks.find((b) => b.label.trim().replace(/:$/, "").trim().toLowerCase() === label);
  const text = found?.text.trim() ?? "";
  return text === "" ? null : text;
}

// Spec 5.8: "Save to library" turns one question's answer into an answer item.
// The body is the Say block and, when there is one, the Long version block.
export async function saveQuestionToLibrary(
  s: Scoped,
  input: { opportunityId: string; questionKey: string },
): Promise<Result<{ id: string; created: boolean }, "not_found" | "invalid">> {
  const opportunity = await s.opportunity.getById(input.opportunityId);
  if (!opportunity) return fail("not_found", "This job no longer exists.");
  // listForJob is ordered by document then position: the first match is the first by position.
  const row = (await s.prepQuestion.listForJob(input.opportunityId)).find((r) => r.questionKey === input.questionKey);
  if (!row) return fail("not_found", "This question is not in the job any more.");

  const sayText = blockText(row.blocks, "say");
  const longText = blockText(row.blocks, "long version");
  if (sayText === null && longText === null) return fail("invalid", LIBRARY_COPY.noAnswerToSave);

  const existing = await s.libraryItem.findBySource(row.questionKey, input.opportunityId);
  if (existing) return ok({ id: existing.id, created: false });

  const parts: string[] = [];
  if (sayText !== null) parts.push(sayText);
  if (longText !== null) parts.push(`**Long version:** ${longText}`);

  const created = await createLibraryItemOnce(
    s,
    { kind: "answer", title: row.question.slice(0, LIBRARY_TITLE_MAX), bodyMd: parts.join("\n\n"), tags: [] },
    { questionKey: row.questionKey, sourceOpportunityId: input.opportunityId, sourceArtifactId: row.artifactId },
  );
  if (!created.ok) return created;
  return ok(created.data);
}
