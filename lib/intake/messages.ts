import type { NeedsTextReason } from "./values";
import type { AddedJob } from "./state";

export const NEEDS_TEXT_MESSAGES: Record<NeedsTextReason, string> = {
  login_required: "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead.",
  blocked: "Jobsmith does not open this kind of link. Paste the posting text instead.",
  timeout: "The page took too long to answer. Paste the posting text instead.",
  too_large: "The page is too large to read. Paste the posting text instead.",
  not_found: "That posting was not found. It may have closed. Paste the posting text if you have it.",
  too_short: "Jobsmith could not find a posting on that page. Paste the posting text instead.",
  unreadable: "Jobsmith could not read that page. Paste the posting text instead.",
  fetch_failed: "Jobsmith could not load that page. Paste the posting text instead.",
};

export const NEEDS_DETAILS_MESSAGES: Record<"ai_off" | "ai_failed", string> = {
  ai_off: "Add the company and role. Jobsmith saves the posting as it is, and you can check the other details later.",
  ai_failed: "Jobsmith could not read the company and role from the posting. Add them to save the job.",
};

export const DUPLICATE_MESSAGE = "You already have this job.";
export const POSTING_TEXT_HINT = "Paste the posting here.";
export const PENDING_MESSAGE = "Reading the posting. This can take a few seconds.";

// Standalone (not part of addedAnnouncement below): the job page's "Mark as
// checked" announces this on success, and its notice renders the text
// above it.
export const MARKED_REVIEWED_MESSAGE = "Marked the details as checked.";
export const REVIEW_NOTICE_TEXT = "Check this job's details. They were not read from the posting automatically.";

export function addedAnnouncement(job: AddedJob): string {
  if (job.note === "review") return `Added ${job.roleTitle} at ${job.companyName}. Check its details on the job page.`;
  if (job.note === "link_only") return `Added ${job.roleTitle} at ${job.companyName}. Jobsmith could not read the posting, so only the link was saved.`;
  return `Added ${job.roleTitle} at ${job.companyName}.`;
}
