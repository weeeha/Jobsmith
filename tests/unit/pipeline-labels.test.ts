import { describe, expect, it } from "vitest";
import { CLOSED_REASONS, WORK_MODES, STAGE_FORMATS, PERSON_ROLES, STAGE_STATUSES } from "@/lib/pipeline/values";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";
import {
  CLOSED_REASON_LABELS,
  WORK_MODE_LABELS,
  STAGE_FORMAT_LABELS,
  PERSON_ROLE_LABELS,
  STAGE_STATUS_WORDS,
  columnTitle,
} from "@/lib/pipeline/labels";

describe("pipeline labels", () => {
  it("gives every closed reason a non-empty label", () => {
    for (const reason of CLOSED_REASONS) {
      expect(CLOSED_REASON_LABELS[reason].length).toBeGreaterThan(0);
    }
  });

  it("matches the fixed closed reason copy", () => {
    expect(CLOSED_REASON_LABELS).toEqual({
      rejected: "Rejected",
      withdrawn: "Withdrawn",
      ghosted: "Ghosted",
      declined: "Declined the offer",
      accepted: "Accepted the offer",
    });
  });

  it("gives every work mode a non-empty label", () => {
    for (const mode of WORK_MODES) {
      expect(WORK_MODE_LABELS[mode].length).toBeGreaterThan(0);
    }
  });

  it("matches the fixed work mode copy", () => {
    expect(WORK_MODE_LABELS).toEqual({ remote: "Remote", hybrid: "Hybrid", onsite: "On site" });
  });

  it("gives every stage format a non-empty label", () => {
    for (const format of STAGE_FORMATS) {
      expect(STAGE_FORMAT_LABELS[format].length).toBeGreaterThan(0);
    }
  });

  it("matches the fixed stage format copy", () => {
    expect(STAGE_FORMAT_LABELS).toEqual({
      phone: "Phone",
      video: "Video",
      onsite: "On site",
      async: "Async",
    });
  });

  it("gives every person role a non-empty label", () => {
    for (const role of PERSON_ROLES) {
      expect(PERSON_ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });

  it("matches the fixed person role copy", () => {
    expect(PERSON_ROLE_LABELS).toEqual({
      recruiter: "Recruiter",
      hiring_manager: "Hiring manager",
      interviewer: "Interviewer",
      referrer: "Referrer",
      other: "Other",
    });
  });

  it("gives every stage status a non-empty word", () => {
    for (const status of STAGE_STATUSES) {
      expect(STAGE_STATUS_WORDS[status].length).toBeGreaterThan(0);
    }
  });

  it("uses the status value itself as the word", () => {
    expect(STAGE_STATUS_WORDS).toEqual({
      upcoming: "upcoming",
      scheduled: "scheduled",
      done: "done",
      skipped: "skipped",
    });
  });

  it("gives every stage kind its column title", () => {
    for (const entry of STAGE_KINDS) {
      expect(columnTitle(entry.kind)).toBe(entry.columnTitle);
    }
  });
});
