// A leaf: no imports at all, because the CLI bundle inlines this file
// straight into its single output file with no node_modules to resolve.

export const MAX_ARTIFACTS_PER_PUSH = 50;
export const MAX_ARTIFACT_BYTES = 1_048_576;
export const MAX_PUSH_BYTES = 4_194_304;
export const RATE_LIMIT_PER_MINUTE = 120;
export const MAX_AUDIO_SEGMENTS = 50;
export const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;
export const TOKEN_PATTERN = /^jsm_[A-Za-z0-9_-]{43}$/;
// Matches what lib/pipeline/slug.ts can produce: letters and digits from any
// script, plus hyphens, and never a `/`, so a slug can never smuggle in an
// extra path segment when it is used to build a URL or a file name.
export const SLUG_PATTERN = /^[\p{L}\p{N}-]{1,100}$/u;

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

// Audio for the CLI (spec 5.5): the plan lists the clips still to make, the
// upload carries finished ones as base64.
export type WireAudioPlan = {
  identity: { provider: string; model: string; style: string };
  voices: { interviewer: string; candidate: string };
  total: number;
  done: number;
  segments: { hash: string; speaker: "interviewer" | "candidate"; text: string }[];
  requestId: string;
};

export type WireAudioUpload = {
  segments: { hash: string; contentType: string; durationMs: number; base64: string }[];
};

export type WireAudioRejectReason = "not_planned" | "too_large" | "bad_content_type" | "bad_base64";

export type WireAudioResult = {
  stored: number;
  skipped: number;
  rejected: { hash: string; reason: WireAudioRejectReason }[];
  requestId: string;
};
