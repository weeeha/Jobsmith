import type { Scoped } from "@/lib/db/scoped";
import { createOpportunity, type CreateOpportunityInput } from "@/lib/pipeline/create";

export const FIXTURE_NOW = new Date("2026-09-19T12:00:00.000Z");

export async function seedOpportunity(
  s: Scoped,
  overrides: Partial<CreateOpportunityInput> = {},
  now: Date = FIXTURE_NOW,
): Promise<{ id: string; slug: string }> {
  const result = await createOpportunity(
    s,
    { companyName: "Acme Robotics", roleTitle: "Product Designer", ...overrides },
    now,
  );
  if (!result.ok) {
    throw new Error(`seedOpportunity failed: ${result.code}: ${result.message}`);
  }
  return result.data;
}

export async function stageIdsByKind(s: Scoped, opportunityId: string): Promise<Record<string, string>> {
  const stages = await s.stage.listForOpportunity(opportunityId);
  const map: Record<string, string> = {};
  for (const stage of stages) {
    map[stage.kind] = stage.id;
  }
  return map;
}
