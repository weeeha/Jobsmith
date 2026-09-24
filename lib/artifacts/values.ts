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
