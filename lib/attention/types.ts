import type { StageKind } from "@/lib/pipeline/kinds";

// What Home's rules read about an active job. The scoped query that fills it
// is the only place it is built from the database.
export type AttentionOpportunity = {
  id: string;
  slug: string;
  roleTitle: string;
  companyName: string;
  stageKind: StageKind;
  stageEnteredAt: Date | null;
  createdAt: Date;
  nextAction: string | null;
  nextActionAt: Date | null;
  lastEventAt: Date | null;
};

// A stage of an active job with status "scheduled" and a time.
export type AttentionStage = { id: string; opportunityId: string; label: string; scheduledAt: Date };
