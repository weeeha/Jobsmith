import type { ClosedReason, WorkMode, StageFormat, PersonRole, StageStatus } from "@/lib/pipeline/values";
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";

export const CLOSED_REASON_LABELS: Record<ClosedReason, string> = {
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
  declined: "Declined the offer",
  accepted: "Accepted the offer",
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On site",
};

export const STAGE_FORMAT_LABELS: Record<StageFormat, string> = {
  phone: "Phone",
  video: "Video",
  onsite: "On site",
  async: "Async",
};

export const PERSON_ROLE_LABELS: Record<PersonRole, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  interviewer: "Interviewer",
  referrer: "Referrer",
  other: "Other",
};

export const STAGE_STATUS_WORDS: Record<StageStatus, string> = {
  upcoming: "upcoming",
  scheduled: "scheduled",
  done: "done",
  skipped: "skipped",
};

export function columnTitle(kind: StageKind): string {
  const entry = STAGE_KINDS.find((s) => s.kind === kind);
  if (!entry) {
    throw new Error(`Unknown stage kind: ${kind}`);
  }
  return entry.columnTitle;
}
