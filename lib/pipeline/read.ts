import type { Scoped, OpportunityRow, CompanyRow, StageRow, LinkedPerson, EventRow, ArtifactMeta } from "@/lib/db/scoped";

export type JobView = {
  opportunity: OpportunityRow;
  company: CompanyRow;
  stages: StageRow[];
  currentStage: StageRow;
  people: LinkedPerson[];
  events: EventRow[];
  documents: ArtifactMeta[];
};

export async function getJobView(s: Scoped, slug: string): Promise<JobView | null> {
  const opportunity = await s.opportunity.getBySlug(slug);
  if (!opportunity) {
    return null;
  }

  // Non-null assertion: every opportunity's companyId points at a company
  // row owned by the same user, enforced by the composite foreign key
  // (opportunity_company_fk).
  const company = (await s.company.getById(opportunity.companyId))!;
  const stages = await s.stage.listForOpportunity(opportunity.id);
  // Non-null assertion: same reasoning as loadState — every real
  // opportunity has a currentStageId that points at one of its own stages.
  const currentStage = stages.find((st) => st.id === opportunity.currentStageId)!;
  const people = await s.opportunityPerson.listForOpportunity(opportunity.id);
  const events = await s.event.listForOpportunity(opportunity.id);
  const documents = await s.artifact.listLatestForOpportunity(opportunity.id);

  return { opportunity, company, stages, currentStage, people, events, documents };
}
