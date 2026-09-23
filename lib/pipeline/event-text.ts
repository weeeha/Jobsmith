import type { EventRow } from "@/lib/db/scoped";
import { CLOSED_REASON_LABELS } from "@/lib/pipeline/labels";
import type { ClosedReason } from "@/lib/pipeline/values";

function metaRecord(meta: unknown): Record<string, unknown> {
  return meta !== null && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
}

function metaString(meta: Record<string, unknown>, key: string): string {
  const value = meta[key];
  return typeof value === "string" ? value : "";
}

export function eventText(event: EventRow): string {
  switch (event.kind) {
    case "created":
      return "Added to the board.";
    case "stage_moved": {
      const meta = metaRecord(event.meta);
      const from = metaRecord(meta.from);
      const to = metaRecord(meta.to);
      return `Moved from ${metaString(from, "label")} to ${metaString(to, "label")}.`;
    }
    case "closed": {
      const meta = metaRecord(event.meta);
      const reason = metaString(meta, "reason") as ClosedReason;
      return `Closed: ${CLOSED_REASON_LABELS[reason] ?? reason}.`;
    }
    case "reopened":
      return "Reopened.";
    case "note":
      return event.body ?? "";
    case "interview_scheduled": {
      const meta = metaRecord(event.meta);
      const stageLabel = metaString(meta, "stageLabel");
      return stageLabel ? `${stageLabel} scheduled.` : "Scheduled.";
    }
    case "document_sent":
      return "Document sent.";
    case "artifact_pushed":
      return "Documents updated.";
    case "next_action_done":
      return `Done: ${event.body ?? ""}.`;
  }
}
