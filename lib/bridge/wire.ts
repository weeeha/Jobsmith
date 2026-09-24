// A leaf: no imports at all, because the CLI bundle inlines this file
// straight into its single output file with no node_modules to resolve.

export const MAX_ARTIFACTS_PER_PUSH = 50;
export const MAX_ARTIFACT_BYTES = 1_048_576;
export const MAX_PUSH_BYTES = 4_194_304;
export const RATE_LIMIT_PER_MINUTE = 120;
export const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;
export const TOKEN_PATTERN = /^jsm_[A-Za-z0-9_-]{43}$/;

export type WireScope = "opportunity" | "company";

export type WireArtifact = {
  key: string;
  kind: string;
  title?: string | null;
  scope?: WireScope;
  stage?: string | null;
  body_md: string;
};

export type WireStatus = "created" | "versioned" | "updated" | "unchanged";

export type WirePushResponse = {
  dryRun: boolean;
  results: { key: string; scope: WireScope; status: WireStatus; version: number }[];
  warnings: { key: string; code: string; message: string }[];
  requestId: string;
};

export type WireOpportunity = {
  slug: string;
  company: string;
  role: string;
  status: "active" | "closed";
  stage: { kind: string; label: string };
};

export type WireListResponse = { opportunities: WireOpportunity[]; requestId: string };

export type WireError = { error: { code: string; message: string }; requestId: string };
