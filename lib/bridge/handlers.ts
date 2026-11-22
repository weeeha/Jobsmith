import { readJsonCapped, bridgeJson, bridgeError } from "./http";
import { pushBodySchema, firstIssue, toIncoming } from "./push-schema";
import { authenticate, type BridgeDeps } from "./auth";
import { logBridgeError } from "./log";
import { loadContextDocument } from "./context-load";
import { MAX_ARTIFACTS_PER_PUSH, MAX_PUSH_BYTES, MAX_ARTIFACT_BYTES, SLUG_PATTERN, type WireOpportunity, type WireStatus } from "./wire";
import { utf8Bytes } from "@/lib/artifacts/normalize";
import { upsertArtifacts } from "@/lib/artifacts/upsert";

export type { BridgeDeps } from "./auth";
export { handleListEvents } from "./events";

// Matches what lib/pipeline/slug.ts actually produces: letters and digits
// from any script (a company or role name is not always ASCII), plus
// hyphens, never a `/` so a slug can never smuggle in an extra path segment.
function isValidSlugShape(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export async function handleListOpportunities(deps: BridgeDeps, request: Request): Promise<Response> {
  const requestId = deps.requestId();
  try {
    const now = deps.now();
    const auth = await authenticate(deps, request, requestId, now);
    if (!auth.ok) return auth.response;

    const status = new URL(request.url).searchParams.get("status") ?? "active";
    if (status !== "active" && status !== "closed" && status !== "all") {
      return bridgeError("invalid_query", requestId, { text: "status must be active, closed or all." });
    }

    const summaries = await auth.s.opportunity.listSummaries(status as "active" | "closed" | "all");
    const opportunities: WireOpportunity[] = summaries.map((s) => ({
      slug: s.slug,
      company: s.companyName,
      role: s.roleTitle,
      status: s.status,
      stage: { kind: s.stage.kind, label: s.stage.label },
    }));
    return bridgeJson({ opportunities, requestId }, { requestId });
  } catch (error) {
    logBridgeError(requestId, error);
    return bridgeError("server_error", requestId);
  }
}

export async function handleGetContext(deps: BridgeDeps, request: Request, slug: string): Promise<Response> {
  const requestId = deps.requestId();
  try {
    const now = deps.now();
    const auth = await authenticate(deps, request, requestId, now);
    if (!auth.ok) return auth.response;

    if (!isValidSlugShape(slug)) {
      return bridgeError("not_found", requestId, { slug });
    }
    const doc = await loadContextDocument(auth.s, slug, now);
    if (doc === null) {
      return bridgeError("not_found", requestId, { slug });
    }
    return new Response(doc, {
      status: 200,
      headers: { "content-type": "text/markdown; charset=utf-8", "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    logBridgeError(requestId, error);
    return bridgeError("server_error", requestId);
  }
}

export async function handlePushArtifacts(deps: BridgeDeps, request: Request, slug: string): Promise<Response> {
  const requestId = deps.requestId();
  try {
    const now = deps.now();
    const auth = await authenticate(deps, request, requestId, now);
    if (!auth.ok) return auth.response;

    if (!isValidSlugShape(slug)) {
      return bridgeError("not_found", requestId, { slug });
    }

    const dryRunParam = new URL(request.url).searchParams.get("dry_run");
    let dryRun: boolean;
    if (dryRunParam === null || dryRunParam === "false" || dryRunParam === "0") {
      dryRun = false;
    } else if (dryRunParam === "true" || dryRunParam === "1") {
      dryRun = true;
    } else {
      return bridgeError("invalid_query", requestId, { text: "dry_run must be true or false." });
    }

    const opportunity = await auth.s.opportunity.getBySlug(slug);
    if (!opportunity) {
      return bridgeError("not_found", requestId, { slug });
    }

    const bodyResult = await readJsonCapped(request, MAX_PUSH_BYTES);
    if (!bodyResult.ok) {
      return bridgeError(bodyResult.code, requestId);
    }

    // A minimal shape peek to short-circuit an oversize array before the full
    // Zod schema runs; the schema's safeParse below validates the shape
    // completely, so this only needs to be defensive enough to read `.length`.
    const rawData = bodyResult.data;
    if (
      typeof rawData === "object" &&
      rawData !== null &&
      Array.isArray((rawData as { artifacts?: unknown }).artifacts) &&
      (rawData as { artifacts: unknown[] }).artifacts.length > MAX_ARTIFACTS_PER_PUSH
    ) {
      return bridgeError("too_many_artifacts", requestId);
    }

    const parsed = pushBodySchema.safeParse(rawData);
    if (!parsed.success) {
      return bridgeError("invalid_payload", requestId, { text: firstIssue(parsed.error) });
    }

    for (const artifact of parsed.data.artifacts) {
      if (utf8Bytes(artifact.body_md) > MAX_ARTIFACT_BYTES) {
        return bridgeError("artifact_too_large", requestId, { key: artifact.key });
      }
    }

    const seenKeys = new Set<string>();
    for (const artifact of parsed.data.artifacts) {
      if (seenKeys.has(artifact.key)) {
        return bridgeError("duplicate_key", requestId, { key: artifact.key });
      }
      seenKeys.add(artifact.key);
    }

    const inputs = parsed.data.artifacts.map(toIncoming);
    const outcome = await upsertArtifacts(auth.s, opportunity.id, inputs, { origin: "pushed", dryRun, now });
    if (!outcome.ok) {
      if (outcome.code === "not_found") {
        return bridgeError("not_found", requestId, { slug });
      }
      return bridgeError("invalid_payload", requestId, { text: outcome.message });
    }

    // A push (origin "pushed") never produces planUpsert's "edited" status:
    // that status is only ever returned for origin "manual". The cast below
    // is sound because of that origin guarantee, not a runtime check.
    const results = outcome.data.results.map((r) => ({
      key: r.key,
      scope: r.scope,
      status: r.status as WireStatus,
      version: r.version,
    }));

    const changed = results.some((r) => r.status !== "unchanged");
    if (!dryRun && changed) {
      deps.revalidate(`/jobs/${slug}`);
      if (results.some((r) => r.status !== "unchanged" && r.scope === "company")) {
        const companySlugs = await auth.s.opportunity.listSlugsForCompany(opportunity.companyId);
        for (const otherSlug of companySlugs) {
          if (otherSlug !== slug) {
            deps.revalidate(`/jobs/${otherSlug}`);
          }
        }
      }
    }

    return bridgeJson({ dryRun, results, warnings: outcome.data.warnings, requestId }, { requestId });
  } catch (error) {
    logBridgeError(requestId, error);
    return bridgeError("server_error", requestId);
  }
}
