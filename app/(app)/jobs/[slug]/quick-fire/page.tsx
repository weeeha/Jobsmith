import { notFound } from "next/navigation";

import { QuickFireRound } from "@/components/player/quick-fire-round";
import { parseDocRef } from "@/lib/artifacts/tabs";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { PREP_COPY } from "@/lib/prep/copy";
import { quickFirePool } from "@/lib/prep/quick-fire";
import type { MarkLevel } from "@/lib/prep/values";

// A server component that only reads: the client starts and ends the session.
export default async function QuickFirePage(props: PageProps<"/jobs/[slug]/quick-fire">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const s = scopedFor(user.id);
  const opportunity = await s.opportunity.getBySlug(slug);
  if (!opportunity) notFound();

  // A bad or foreign `doc` reads as no `doc`: every bank of the job.
  const ref = parseDocRef(searchParams.doc);
  const artifactKey = ref?.scope === "opportunity" ? ref.key : null;

  const rows = await s.prepQuestion.listForJob(opportunity.id);
  const marks = await s.prepMark.listForJob(opportunity.id);
  const levels = new Map<string, MarkLevel>(marks.map((m) => [m.questionKey, m.level]));
  const pool = quickFirePool(rows, levels, artifactKey);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">{PREP_COPY.buttons.quickFire}</h1>
      <QuickFireRound questions={pool} opportunityId={opportunity.id} backHref={`/jobs/${slug}?tab=prep`} />
    </div>
  );
}
