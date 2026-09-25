import { ARTIFACT_KINDS, kindInfo, type ArtifactTab } from "./kinds";
import type { ArtifactScope } from "./values";
import { KEY_PATTERN } from "@/lib/bridge/wire";
import type { ArtifactMeta } from "@/lib/db/scoped";

export type DocRef = { scope: ArtifactScope; key: string };

export function parseDocRef(value: string | string[] | undefined): DocRef | null {
  if (typeof value !== "string") return null;

  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) return null;

  const prefix = value.slice(0, colonIndex);
  const key = value.slice(colonIndex + 1);
  const scope: ArtifactScope | null = prefix === "job" ? "opportunity" : prefix === "company" ? "company" : null;
  if (!scope) return null;
  if (!KEY_PATTERN.test(key)) return null;

  return { scope, key };
}

export function formatDocRef(ref: DocRef): string {
  return `${ref.scope === "opportunity" ? "job" : "company"}:${ref.key}`;
}

export function scopeOf(row: { companyId: string | null }): ArtifactScope {
  return row.companyId === null ? "opportunity" : "company";
}

export function docsForTab(docs: ArtifactMeta[], tab: ArtifactTab): ArtifactMeta[] {
  return docs
    .filter((doc) => kindInfo(doc.kind).tab === tab)
    .sort((a, b) => {
      const kindDiff = ARTIFACT_KINDS.findIndex((k) => k.kind === a.kind) - ARTIFACT_KINDS.findIndex((k) => k.kind === b.kind);
      if (kindDiff !== 0) return kindDiff;
      const titleDiff = a.title.localeCompare(b.title);
      if (titleDiff !== 0) return titleDiff;
      return a.key.localeCompare(b.key);
    });
}

export type DocGroup = { id: string; heading: string; docs: ArtifactMeta[] };

export function researchGroups(jobDocs: ArtifactMeta[], companyDocs: ArtifactMeta[], companyName: string): DocGroup[] {
  const groups: DocGroup[] = [];

  const job = docsForTab(jobDocs, "research");
  if (job.length > 0) groups.push({ id: "job", heading: "This job", docs: job });

  const company = docsForTab(companyDocs, "research");
  if (company.length > 0) {
    groups.push({ id: "company", heading: `Shared with every job at ${companyName}`, docs: company });
  }

  return groups;
}

export function prepGroups(docs: ArtifactMeta[], stages: { id: string; label: string; position: number }[]): DocGroup[] {
  const prepDocs = docsForTab(docs, "prep");
  const stageIds = new Set(stages.map((s) => s.id));
  const groups: DocGroup[] = [];

  const general = prepDocs.filter((doc) => doc.stageId === null || !stageIds.has(doc.stageId));
  if (general.length > 0) groups.push({ id: "general", heading: "General", docs: general });

  const orderedStages = [...stages].sort((a, b) => a.position - b.position);
  for (const stage of orderedStages) {
    const staged = prepDocs.filter((doc) => doc.stageId === stage.id);
    if (staged.length > 0) groups.push({ id: stage.id, heading: stage.label, docs: staged });
  }

  return groups;
}

export function selectDoc(groups: DocGroup[], ref: DocRef | null): ArtifactMeta | null {
  const flattened = groups.flatMap((g) => g.docs);
  if (flattened.length === 0) return null;

  if (ref) {
    const match = flattened.find((doc) => scopeOf(doc) === ref.scope && doc.key === ref.key);
    if (match) return match;
  }

  return flattened[0];
}

export function stagesWithArtifacts(jobDocs: ArtifactMeta[]): Set<string> {
  const stageIds = new Set<string>();
  for (const doc of jobDocs) {
    if (doc.stageId !== null) stageIds.add(doc.stageId);
  }
  return stageIds;
}
