import { LIBRARY_KINDS } from "@/lib/prep/values";
import type { LibraryQuery } from "./items";

type Raw = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

// The Library's URL parameters: q, kind, tag and archived=1. A repeated or
// unknown value reads as absent, so a hand-edited URL never errors.
export function parseLibraryQuery(params: Raw): LibraryQuery {
  const kind = single(params.kind);
  return {
    q: single(params.q),
    kind: (LIBRARY_KINDS as readonly string[]).includes(kind ?? "") ? (kind as LibraryQuery["kind"]) : undefined,
    tag: single(params.tag),
    includeArchived: single(params.archived) === "1",
  };
}
