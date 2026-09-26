import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { getJobView } from "@/lib/pipeline/read";
import { toOpportunityState, stageControlsFor } from "@/lib/pipeline/stage-controls";
import { parseDocRef } from "@/lib/artifacts/tabs";
import { JobHeader } from "@/components/job/job-header";
import { StageStepper } from "@/components/job/stage-stepper";
import { NextActionBar } from "@/components/job/next-action-bar";
import { JobTabs, type JobTabId } from "@/components/job/job-tabs";
import { TabOverview } from "@/components/job/tab-overview";
import { TabResearch } from "@/components/job/tab-research";
import { TabPeople } from "@/components/job/tab-people";
import { TabDocuments } from "@/components/job/tab-documents";
import { TabTimeline } from "@/components/job/tab-timeline";
import { TabPrep } from "@/components/job/tab-prep";

const TAB_IDS: readonly JobTabId[] = ["overview", "research", "people", "documents", "timeline", "prep"];

function resolveTab(value: string | string[] | undefined): JobTabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value) ? (value as JobTabId) : "overview";
}

function resolveVersion(value: string | string[] | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

export default async function JobPage(props: PageProps<"/jobs/[slug]">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const s = scopedFor(user.id);
  const view = await getJobView(s, slug);
  if (!view) {
    notFound();
  }

  const state = toOpportunityState(view);
  const controls = stageControlsFor(state, new Date());
  const tab = resolveTab(searchParams.tab);
  const docRef = parseDocRef(searchParams.doc);
  const version = resolveVersion(searchParams.v);
  const stageOptions = view.stages.map((stage) => ({ id: stage.id, label: stage.label }));
  const basePath = `/jobs/${slug}`;

  return (
    <div className="flex flex-col gap-6 p-6">
      <JobHeader opportunity={view.opportunity} companyName={view.company.name} needsReview={view.opportunity.needsReview} />
      <StageStepper
        opportunity={view.opportunity}
        companyName={view.company.name}
        stages={view.stages}
        currentStageId={view.opportunity.currentStageId!}
        controls={controls}
      />
      <NextActionBar opportunity={view.opportunity} />
      <div>
        <JobTabs activeTab={tab} basePath={basePath} />
        {tab === "overview" && (
          <TabOverview opportunity={view.opportunity} company={view.company} opportunityId={view.opportunity.id} />
        )}
        {tab === "research" && (
          <TabResearch
            s={s}
            opportunityId={view.opportunity.id}
            companyId={view.company.id}
            companyName={view.company.name}
            jobDocuments={view.documents}
            docRef={docRef}
            basePath={basePath}
            stages={stageOptions}
          />
        )}
        {tab === "people" && (
          <TabPeople opportunityId={view.opportunity.id} stages={stageOptions} people={view.people} />
        )}
        {tab === "documents" && (
          <TabDocuments
            s={s}
            opportunityId={view.opportunity.id}
            companyId={view.company.id}
            jobDocuments={view.documents}
            docRef={docRef}
            version={version}
            basePath={basePath}
            stages={stageOptions}
          />
        )}
        {tab === "timeline" && <TabTimeline opportunityId={view.opportunity.id} events={view.events} />}
        {tab === "prep" && (
          <TabPrep
            s={s}
            opportunityId={view.opportunity.id}
            companyId={view.company.id}
            jobDocuments={view.documents}
            docRef={docRef}
            basePath={basePath}
            stages={view.stages}
            slug={slug}
          />
        )}
      </div>
    </div>
  );
}
