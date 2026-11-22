import type { JobJson, JobJsonDocument } from "./wire";
import type { Scoped } from "@/lib/db/scoped";
import { getJobView, type JobView } from "@/lib/pipeline/read";
import { parseStoredFit } from "@/lib/fit/stored";
import { hardFilters } from "@/lib/fit/hard-filters";
import { loadFitProfile } from "@/lib/fit/profile";

export type JobJsonInput = {
  view: JobView;
  documents: JobJsonDocument[];
  prep: JobJson["prep"];
  requests: JobJson["requests"];
  failedFilters: string[];
  generatedAt: Date;
};

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

// Pure. Leaves out the posting body and every person's email on purpose.
export function buildJobJson(input: JobJsonInput): JobJson {
  const { view, documents, prep, requests, failedFilters, generatedAt } = input;
  const { opportunity: o, company, currentStage } = view;
  const stageLabel = new Map(view.stages.map((st) => [st.id, st.label]));
  const stored = o.fitStatus === "none" ? null : parseStoredFit(o.fit);

  return {
    schema: "job/v1",
    generated_at: generatedAt.toISOString(),
    slug: o.slug,
    role: o.roleTitle,
    company: { name: company.name, domain: company.domain, size: company.size, industry: company.industry, hq: company.hq },
    location: o.location,
    work_mode: o.workMode,
    status: o.status,
    closed_reason: o.closedReason,
    source_url: o.sourceUrl,
    posting_captured_at: iso(o.postingCapturedAt),
    current_stage: { id: currentStage.id, kind: currentStage.kind, label: currentStage.label },
    stages: view.stages.map((st) => ({
      id: st.id,
      position: st.position,
      kind: st.kind,
      label: st.label,
      status: st.status,
      scheduled_at: iso(st.scheduledAt),
      completed_at: iso(st.completedAt),
      format: st.format,
    })),
    people: view.people.map((link) => ({
      name: link.person.name,
      title: link.person.title,
      role: link.role,
      stage: link.stageId ? (stageLabel.get(link.stageId) ?? null) : null,
      linkedin_url: link.person.linkedinUrl,
    })),
    fit:
      o.fitStatus === "none"
        ? null
        : {
            status: o.fitStatus,
            score: stored?.score ?? null,
            summary: stored?.summary ?? null,
            failed_filters: failedFilters,
          },
    next_action: o.nextAction,
    next_action_at: iso(o.nextActionAt),
    documents,
    prep,
    requests,
  };
}

// Apply and Research's document index, Prep's readers and the runner's
// requests do not exist on this branch, so those three carry their empty
// values until their cycles land.
export async function loadJobJson(s: Scoped, slug: string, now: Date): Promise<JobJson | null> {
  const view = await getJobView(s, slug);
  if (!view) return null;
  const o = view.opportunity;
  const profile = await loadFitProfile(s);
  const failedFilters = hardFilters(
    {
      roleTitle: o.roleTitle,
      location: o.location,
      workMode: o.workMode,
      compMin: o.compMin,
      compMax: o.compMax,
      compCurrency: o.compCurrency,
    },
    profile.preferences,
  ).failed;
  return buildJobJson({
    view,
    documents: [],
    prep: { questions: 0, solid: 0, okay: 0, shaky: 0, unmarked: 0 },
    requests: [],
    failedFilters,
    generatedAt: now,
  });
}
