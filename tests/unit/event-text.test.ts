import { describe, expect, it } from "vitest";
import { eventText } from "@/lib/pipeline/event-text";
import type { EventRow } from "@/lib/db/scoped";

const NOW = new Date("2026-09-19T12:00:00.000Z");

function makeEvent(overrides: Partial<EventRow> & Pick<EventRow, "kind">): EventRow {
  return {
    id: "e1",
    userId: "u1",
    opportunityId: "o1",
    stageId: null,
    body: null,
    meta: {},
    occurredAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as EventRow;
}

describe("eventText", () => {
  it("created: Added to the board.", () => {
    expect(eventText(makeEvent({ kind: "created" }))).toBe("Added to the board.");
  });

  it("stage_moved: Moved from <from label> to <to label>.", () => {
    const event = makeEvent({
      kind: "stage_moved",
      meta: {
        from: { stageId: "s1", kind: "saved", label: "Saved" },
        to: { stageId: "s2", kind: "applied", label: "Applied" },
      },
    });
    expect(eventText(event)).toBe("Moved from Saved to Applied.");
  });

  it("closed: Closed: <reason label>.", () => {
    expect(eventText(makeEvent({ kind: "closed", meta: { reason: "rejected" } }))).toBe("Closed: Rejected.");
  });

  it("reopened: Reopened.", () => {
    expect(eventText(makeEvent({ kind: "reopened" }))).toBe("Reopened.");
  });

  it("note: the body", () => {
    expect(eventText(makeEvent({ kind: "note", body: "Recruiter called, moving to onsite next week." }))).toBe(
      "Recruiter called, moving to onsite next week.",
    );
  });

  it("interview_scheduled: <stage label> scheduled.", () => {
    const event = makeEvent({
      kind: "interview_scheduled",
      meta: { stageLabel: "Panel", scheduledAt: NOW.toISOString(), format: "video" },
    });
    expect(eventText(event)).toBe("Panel scheduled.");
  });

  it("interview_scheduled falls back when meta.stageLabel is missing", () => {
    expect(eventText(makeEvent({ kind: "interview_scheduled", meta: {} }))).toBe("Scheduled.");
  });

  it("document_sent: Document sent.", () => {
    expect(eventText(makeEvent({ kind: "document_sent" }))).toBe("Document sent.");
  });

  it("artifact_pushed: Documents updated.", () => {
    expect(eventText(makeEvent({ kind: "artifact_pushed" }))).toBe("Documents updated.");
  });

  it("next_action_done: Done: <text>.", () => {
    expect(eventText(makeEvent({ kind: "next_action_done", body: "Follow up with recruiter" }))).toBe(
      "Done: Follow up with recruiter.",
    );
  });
});
