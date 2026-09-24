import { STAGE_KINDS, type StageKind } from "./kinds";

export const STAGE_STATUSES = ["upcoming", "scheduled", "done", "skipped"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const STAGE_FORMATS = ["phone", "video", "onsite", "async"] as const;
export type StageFormat = (typeof STAGE_FORMATS)[number];

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const OPPORTUNITY_SOURCES = ["url", "text", "manual", "feed"] as const;
export type OpportunitySource = (typeof OPPORTUNITY_SOURCES)[number];

export const OPPORTUNITY_STATUSES = ["active", "closed"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const CLOSED_REASONS = ["rejected", "withdrawn", "ghosted", "declined", "accepted"] as const;
export type ClosedReason = (typeof CLOSED_REASONS)[number];

export const FIT_STATUSES = ["none", "pending", "done", "failed"] as const;
export type FitStatus = (typeof FIT_STATUSES)[number];

export const ATS_KINDS = ["greenhouse", "ashby", "lever", "other"] as const;
export type AtsKind = (typeof ATS_KINDS)[number];

export const PERSON_ROLES = ["recruiter", "hiring_manager", "interviewer", "referrer", "other"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export const EVENT_KINDS = [
  "created",
  "stage_moved",
  "closed",
  "reopened",
  "note",
  "interview_scheduled",
  "document_sent",
  "artifact_pushed",
  "next_action_done",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

// STAGE_KINDS.map() returns StageKind[] (Array#map's library signature is
// not tuple-preserving), but Drizzle's text(name, { enum }) requires a
// non-empty tuple. Every list above is already a literal `as const` array, a
// tuple by construction, and needs no assertion; this is the only list
// derived through a method call, so it is the only one that needs one.
export const STAGE_KIND_VALUES = STAGE_KINDS.map((s) => s.kind) as [StageKind, ...StageKind[]];
