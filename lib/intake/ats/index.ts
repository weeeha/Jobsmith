import type { Result } from "@/lib/result";
import { ok, fail } from "@/lib/result";
import type { GuardedFetch, FetchFailure } from "@/lib/intake/fetch-guard";
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

  const posting =
    ref.kind === "greenhouse" ? mapGreenhouse(ref, json) : ref.kind === "lever" ? mapLever(ref, json) : mapAshby(ref, json);
  if (!posting) return fail("unreadable", "unreadable");
  return ok(posting);
}
