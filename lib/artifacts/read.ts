import type { Scoped, ArtifactRow, ArtifactMeta } from "@/lib/db/scoped";
import type { DocRef } from "./tabs";

export type DocumentView = { current: ArtifactRow; versions: ArtifactMeta[]; latestVersion: number };

// Read-only: takes no lock and opens no transaction. Every real caller is a
// page render, not a mutation.
export async function getDocument(
  s: Scoped,
  context: { opportunityId: string; companyId: string },
  ref: DocRef,
  version?: number,
): Promise<DocumentView | null> {
  const scopeRef = ref.scope === "opportunity" ? { opportunityId: context.opportunityId } : { companyId: context.companyId };
  const versions = await s.artifact.listVersions(scopeRef, ref.key);
  if (versions.length === 0) {
    return null;
  }
  const latestVersion = versions[versions.length - 1].version;

  const current = (version !== undefined ? await s.artifact.getVersion(scopeRef, ref.key, version) : null) ?? (await s.artifact.getLatest(scopeRef, ref.key))!;

  return { current, versions, latestVersion };
}
