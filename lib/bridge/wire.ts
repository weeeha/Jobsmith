// A leaf: no imports at all, because the CLI bundle inlines this file
// straight into its single output file with no node_modules to resolve.

export const MAX_ARTIFACTS_PER_PUSH = 50;
export const MAX_ARTIFACT_BYTES = 1_048_576;
export const MAX_PUSH_BYTES = 4_194_304;
export const RATE_LIMIT_PER_MINUTE = 120;
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

export type WireEvent = {
  id: string;
  kind: string;
  slug: string;
  stage: string | null;
  occurred_at: string;
  created_at: string;
  body: string | null;
  meta: Record<string, unknown>;
};

export type WireEventsResponse = { events: WireEvent[]; next: string | null; requestId: string };

export type WireError = { error: { code: string; message: string }; requestId: string };

// Milestone 30: MCP server for the Bridge
export const MCP_PROTOCOL_BASELINE = "2025-06-18";
export const EVENTS_PAGE_MAX = 200;
export const EVENTS_PAGE_DEFAULT = 100; // the spec gives no default; owner may change it
export const EVENTS_LOOKBACK_DEFAULT_HOURS = 24;
export const EVENTS_LOOKBACK_MAX_DAYS = 90;
export const LIST_JOBS_MAX = 200;
export const LIST_JOBS_DEFAULT = 100;
export const FEED_ITEMS_MAX = 50;
export const FEED_ITEMS_DEFAULT = 20;
export const RESOURCES_PAGE = 50;

// job/v1: the structured read of one job (Milestone 30, Task 4).
export type JobJsonDocument = {
  key: string;
  kind: string;
  scope: WireScope;
  title: string;
  stage: string | null;
  version: number;
  origin: string;
  updated_at: string;
  edited: boolean;
  sent_at: string | null;
  open_request: JobJsonOpenRequest | null;
};
// Apply and Research's JSON index does not exist on this branch, so the
// open-request fields are not known yet. Narrow this to that index's exact
// entry fields when it lands (Task 23 changes only where they are read from).
export type JobJsonOpenRequest = Record<string, unknown>;
export type JobJson = {
  schema: "job/v1";
  generated_at: string;
  slug: string;
  role: string;
  company: { name: string; domain: string | null; size: string | null; industry: string | null; hq: string | null };
  location: string | null;
  work_mode: string | null;
  status: "active" | "closed";
  closed_reason: string | null;
  source_url: string | null;
  posting_captured_at: string | null;
  current_stage: { id: string; kind: string; label: string };
  stages: {
    id: string;
    position: number;
    kind: string;
    label: string;
    status: string;
    scheduled_at: string | null;
    completed_at: string | null;
    format: string | null;
  }[];
  people: { name: string; title: string | null; role: string; stage: string | null; linkedin_url: string | null }[];
  fit: { status: string; score: number | null; summary: string | null; failed_filters: string[] } | null;
  next_action: string | null;
  next_action_at: string | null;
  documents: JobJsonDocument[];
  prep: { questions: number; solid: number; okay: number; shaky: number; unmarked: number };
  requests: { id: string; kind: string; target: string; status: string; stage: string | null; runner: string | null }[];
};
