import type { Result } from "@/lib/result";
import { ok, fail } from "@/lib/result";
import type { GuardedFetch, FetchFailure } from "@/lib/intake/fetch-guard";
import { MAX_POSTING_CHARS } from "@/lib/intake/values";
import { atsApiRequest, type AtsRef, type AtsPosting } from "./match";
import { mapGreenhouse } from "./greenhouse";
import { mapLever } from "./lever";
import { mapAshby } from "./ashby";

export async function fetchAtsPosting(
  ref: AtsRef,
  fetch: GuardedFetch,
  signal?: AbortSignal,
): Promise<Result<AtsPosting, FetchFailure | "unreadable">> {
  const request = atsApiRequest(ref);
  const response = await fetch(request.url, { accept: "json", method: request.method, body: request.body, signal });
  if (!response.ok) return fail(response.code, response.message);

  let json: unknown;
  try {
    json = JSON.parse(response.data.body);
  } catch {
    return fail("unreadable", "unreadable");
  }

  let posting: AtsPosting | null;
  try {
    posting =
      ref.kind === "greenhouse" ? mapGreenhouse(ref, json) : ref.kind === "lever" ? mapLever(ref, json) : mapAshby(ref, json);
  } catch {
    // A vendor body deep enough to overflow turndown's own recursion reads
    // the same as any other posting this mapper cannot make sense of.
    return fail("unreadable", "unreadable");
  }
  if (!posting) return fail("unreadable", "unreadable");
  // The vendor's own body has no length limit on its side; cut it here the
  // same way readablePage cuts a fetched page's body, so it never trips
  // createOpportunity's own posting-length check downstream.
  return ok({ ...posting, bodyMd: posting.bodyMd.slice(0, MAX_POSTING_CHARS) });
}
