import { z } from "zod";
import type { Scoped, LibraryItemRow } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { LIST_ENTRY_MAX, LIST_MAX_ENTRIES, normalizeList } from "@/lib/preferences/schema";
import { LIBRARY_KINDS, type LibraryKind } from "@/lib/prep/values";

export type { LibraryKind };

export const LIBRARY_TITLE_MAX = 200;
// The spec gives no limit; this is the plan's constant.
export const LIBRARY_BODY_MAX = 50_000;

const tagsSchema = z
  .array(z.string({ message: "Each tag must be text." }), { message: "Tags must be a list." })
  .transform((values) => normalizeList(values))
  .pipe(
    z
      .array(z.string().max(LIST_ENTRY_MAX, { message: `Keep each tag to ${LIST_ENTRY_MAX} characters or fewer.` }))
      .max(LIST_MAX_ENTRIES, { message: `Use at most ${LIST_MAX_ENTRIES} tags.` }),
  );

export const libraryItemInputSchema = z.object({
  kind: z.enum(LIBRARY_KINDS, { message: "Choose answer, story, intro or fact." }),
  title: z
    .string({ message: "Give the item a title." })
    .trim()
    .min(1, { message: "Give the item a title." })
    .max(LIBRARY_TITLE_MAX, { message: `Keep the title to ${LIBRARY_TITLE_MAX} characters or fewer.` }),
  bodyMd: z
    .string({ message: "The body must be text." })
    .max(LIBRARY_BODY_MAX, { message: `Keep the body to ${LIBRARY_BODY_MAX.toLocaleString("en-US")} characters or fewer.` }),
  tags: tagsSchema,
});

// Answers come from questions (spec 5.8); by hand the user makes the other three.
export const HAND_CREATED_KINDS = ["story", "intro", "fact"] as const;
export const newLibraryItemInputSchema = libraryItemInputSchema.extend({
  kind: z.enum(HAND_CREATED_KINDS, { message: "Choose story, intro or fact." }),
});

export type LibraryItemInput = z.input<typeof libraryItemInputSchema>;

export type LibraryItemView = {
  id: string;
  kind: LibraryKind;
  title: string;
  bodyMd: string;
  tags: string[];
  questionKey: string | null;
  sourceOpportunityId: string | null;
  sourceArtifactId: string | null;
  archivedAt: Date | null;
  updatedAt: Date;
};

function toView(row: LibraryItemRow): LibraryItemView {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    bodyMd: row.bodyMd,
    tags: row.tags,
    questionKey: row.questionKey,
    sourceOpportunityId: row.sourceOpportunityId,
    sourceArtifactId: row.sourceArtifactId,
    archivedAt: row.archivedAt,
    updatedAt: row.updatedAt,
  };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the item and try again.";
}

export async function createLibraryItem(
  s: Scoped,
  input: LibraryItemInput,
  source: { questionKey?: string; sourceOpportunityId?: string; sourceArtifactId?: string | null } = {},
): Promise<Result<LibraryItemView, "invalid">> {
  const parsed = libraryItemInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", firstIssue(parsed.error));
  const row = await s.libraryItem.insert({
    ...parsed.data,
    questionKey: source.questionKey ?? null,
    sourceOpportunityId: source.sourceOpportunityId ?? null,
    sourceArtifactId: source.sourceArtifactId ?? null,
  });
  return ok(toView(row));
}

export async function updateLibraryItem(
  s: Scoped,
  id: string,
  input: LibraryItemInput,
): Promise<Result<LibraryItemView, "not_found" | "invalid">> {
  const parsed = libraryItemInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", firstIssue(parsed.error));
  // The source fields and the question key are not part of an edit.
  const row = await s.libraryItem.update(id, parsed.data);
  if (!row) return fail("not_found", "This item no longer exists.");
  return ok(toView(row));
}

export async function archiveLibraryItem(
  s: Scoped,
  id: string,
  archived: boolean,
  now: Date = new Date(),
): Promise<Result<LibraryItemView, "not_found">> {
  const row = await s.libraryItem.update(id, { archivedAt: archived ? now : null });
  if (!row) return fail("not_found", "This item no longer exists.");
  return ok(toView(row));
}

export async function getLibraryItem(s: Scoped, id: string): Promise<LibraryItemView | null> {
  const row = await s.libraryItem.getById(id);
  return row ? toView(row) : null;
}

export type LibraryQuery = { q?: string; kind?: LibraryKind; tag?: string; includeArchived?: boolean };
export type LibraryListRow = LibraryItemView & { firstLine: string };

const FIRST_LINE_MAX = 140;

// The first non-empty line of a Markdown body, without its markers.
export function firstLine(bodyMd: string): string {
  for (const raw of bodyMd.split(/\r?\n/)) {
    const line = raw
      .trim()
      .replace(/^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)+/, "")
      .replace(/(\*\*|__|`)/g, "")
      .replace(/\*(\S[^*]*)\*/g, "$1")
      .trim();
    if (line !== "") return line.length > FIRST_LINE_MAX ? line.slice(0, FIRST_LINE_MAX) : line;
  }
  return "";
}

export async function listLibrary(s: Scoped, query: LibraryQuery): Promise<LibraryListRow[]> {
  const rows = await s.libraryItem.list({ includeArchived: query.includeArchived === true });
  const q = query.q?.trim().toLocaleLowerCase() ?? "";
  const tag = query.tag?.trim().toLocaleLowerCase() ?? "";
  return rows
    .filter((row) => {
      if (query.kind && row.kind !== query.kind) return false;
      if (tag !== "" && !row.tags.some((t) => t.toLocaleLowerCase() === tag)) return false;
      if (q === "") return true;
      return (
        row.title.toLocaleLowerCase().includes(q) ||
        row.bodyMd.toLocaleLowerCase().includes(q) ||
        row.tags.some((t) => t.toLocaleLowerCase().includes(q))
      );
    })
    .sort((x, y) => y.updatedAt.getTime() - x.updatedAt.getTime())
    .map((row) => ({ ...toView(row), firstLine: firstLine(row.bodyMd) }));
}
