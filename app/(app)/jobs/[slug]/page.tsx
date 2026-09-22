import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { getJobView } from "@/lib/pipeline/read";
import { toOpportunityState, stageControlsFor } from "@/lib/pipeline/stage-controls";
import { JobHeader } from "@/components/job/job-header";
import { StageStepper } from "@/components/job/stage-stepper";
import { NextActionBar } from "@/components/job/next-action-bar";

export default async function JobPage(props: PageProps<"/jobs/[slug]">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const view = await getJobView(scopedFor(user.id), slug);
  if (!view) {
    notFound();
  }

  const state = toOpportunityState(view);
  const controls = stageControlsFor(state, new Date());

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
      {/* Task 11 adds the tab strip and the active tab's content below this line. */}
    </div>
  );
}
