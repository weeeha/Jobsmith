import type { AttentionOpportunity } from "@/lib/attention/types";

// 22:30 in Amsterdam and 16:30 in New York on the same calendar day, so one
// fixed instant shows how the profile zone moves "today".
export const ATTENTION_NOW = new Date("2026-10-11T20:30:00.000Z");

// A saved job entered earlier on the same day: no rule applies to it until a
// test overrides something.
export function attentionOpp(id: string, overrides: Partial<AttentionOpportunity> = {}): AttentionOpportunity {
  return {
    id,
    slug: id,
    roleTitle: "Product Designer",
    companyName: "Acme Robotics",
    stageKind: "saved",
    stageEnteredAt: new Date("2026-10-11T08:00:00.000Z"),
    createdAt: new Date("2026-10-11T08:00:00.000Z"),
    nextAction: null,
    nextActionAt: null,
    lastEventAt: null,
    ...overrides,
  };
}
