import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { getJobView } from "@/lib/pipeline/read";
import { toOpportunityState, stageControlsFor } from "@/lib/pipeline/stage-controls";
import { JobHeader } from "@/components/job/job-header";
import { StageStepper } from "@/components/job/stage-stepper";
import { NextActionBar } from "@/components/job/next-action-bar";
import { JobTabs, type JobTabId } from "@/components/job/job-tabs";
import { TabOverview } from "@/components/job/tab-overview";
import { TabPeople } from "@/components/job/tab-people";
import { TabTimeline } from "@/components/job/tab-timeline";

const TAB_IDS: readonly JobTabId[] = ["overview", "people", "timeline"];

function resolveTab(value: string | string[] | undefined): JobTabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value) ? (value as JobTabId) : "overview";
}

export default async function JobPage(props: PageProps<"/jobs/[slug]">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const view = await getJobView(scopedFor(user.id), slug);
  if (!view) {
    notFound();
  }

  const state = toOpportunityState(view);
  const controls = stageControlsFor(state, new Date());
  const tab = resolveTab(searchParams.tab);
  const stageOptions = view.stages.map((stage) => ({ id: stage.id, label: stage.label }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <JobHeader opportunity={view.opportunity} companyName={view.company.name} />
      <StageStepper
        opportunity={view.opportunity}
        companyName={view.company.name}
        stages={view.stages}
        currentStageId={view.opportunity.currentStageId!}
        controls={controls}
      />
      <NextActionBar opportunity={view.opportunity} />
      <div>
        <JobTabs activeTab={tab} basePath={`/jobs/${slug}`} />
        {tab === "overview" && (
          <TabOverview opportunity={view.opportunity} company={view.company} opportunityId={view.opportunity.id} />
        )}
        {tab === "people" && (
          <TabPeople opportunityId={view.opportunity.id} stages={stageOptions} people={view.people} />
        )}
        {tab === "timeline" && <TabTimeline opportunityId={view.opportunity.id} events={view.events} />}
      </div>
    </div>
  );
}
