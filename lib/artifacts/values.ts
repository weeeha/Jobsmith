export const ARTIFACT_ORIGINS = ["pushed", "pasted", "manual", "generated"] as const;
export type ArtifactOrigin = (typeof ARTIFACT_ORIGINS)[number];

export const ARTIFACT_SCOPES = ["opportunity", "company"] as const;
export type ArtifactScope = (typeof ARTIFACT_SCOPES)[number];

export const UPSERT_STATUSES = ["created", "versioned", "updated", "unchanged", "edited"] as const;
export type UpsertStatus = (typeof UPSERT_STATUSES)[number];

export const ARTIFACT_WARNING_CODES = [
  "unknown_kind",
  "stage_not_found",
  "stage_ignored",
  "company_scope_not_allowed",
  "sent_locked",
] as const;
export type ArtifactWarningCode = (typeof ARTIFACT_WARNING_CODES)[number];

export type ArtifactWarning = { key: string; code: ArtifactWarningCode; message: string };

export function warningMessage(
  code: ArtifactWarningCode,
  key: string,
  detail: { kind?: string; stage?: string; version?: number },
): string {
  switch (code) {
    case "unknown_kind":
      return `${key}: unknown kind "${detail.kind}", stored as other.`;
    case "stage_not_found":
      return `${key}: no stage matches "${detail.stage}", stored without a stage.`;
    case "stage_ignored":
      return `${key}: documents shared with the whole company have no stage, so "${detail.stage}" was ignored.`;
    case "company_scope_not_allowed":
      return `${key}: only research, fit briefs and people notes can be shared with the whole company, so it was stored for this job.`;
    case "sent_locked":
      return `${key}: version ${detail.version} was sent, so its title, kind and stage stay as they were.`;
  }
}
