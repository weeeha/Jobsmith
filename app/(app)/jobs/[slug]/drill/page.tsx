import Link from "next/link";
import { notFound } from "next/navigation";

import { DrillPlayer } from "@/components/player/drill-player";
import { EmptyState } from "@/components/super-ai/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { audioDeps } from "@/lib/audio/deps";
import { formatDocRef, parseDocRef } from "@/lib/artifacts/tabs";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { env } from "@/lib/env";
import { audioContext } from "@/lib/prep/audio-status";
import { PREP_COPY } from "@/lib/prep/copy";
import { loadDrillData } from "@/lib/prep/drill";

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

// A server component that only reads: the client starts and ends the session.
// Every query value is checked here; a bad one reads as no value.
export default async function DrillPage(props: PageProps<"/jobs/[slug]/drill">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const s = scopedFor(user.id);
  const opportunity = await s.opportunity.getBySlug(slug);
  if (!opportunity) notFound();

  const ref = parseDocRef(searchParams.doc);
  const docKey = ref?.scope === "opportunity" ? ref.key : null;
  const sectionRaw = single(searchParams.section)?.trim() ?? "";
  const section = sectionRaw !== "" && sectionRaw.length <= 200 ? sectionRaw : null;
  const n = single(searchParams.n);
  const count = n !== null && /^\d{1,2}$/.test(n) && Number(n) >= 1 && Number(n) <= 50 ? Number(n) : null;
  const onlyShaky = single(searchParams.only) === "shaky";

  const audio = await audioContext(s, audioDeps(), env().TTS);
  const loaded = await loadDrillData(s, { opportunityId: opportunity.id, docKey, section, count, onlyShaky, audio });
  if (!loaded.ok && loaded.code === "not_found") notFound();

  // Each request is its own run. "Drill the shaky ones again" lands on this same
  // route, and React would otherwise keep the finished run's state (its index
  // and its summary phase) and hand it the new questions.
  const runId = crypto.randomUUID();
  const backHref = `/jobs/${slug}?tab=prep`;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">{PREP_COPY.drill.heading}</h1>
      {loaded.ok ? (
        <DrillPlayer
          key={runId}
          questions={loaded.data.questions}
          sessionMeta={loaded.data.sessionMeta}
          opportunityId={opportunity.id}
          slug={slug}
          docRef={docKey === null ? null : formatDocRef({ scope: "opportunity", key: docKey })}
          speed={loaded.data.settings.speed}
          browserVoices={loaded.data.settings.browserVoices}
        />
      ) : (
        <>
          <EmptyState size="panel" title={onlyShaky ? PREP_COPY.drill.emptyShaky : PREP_COPY.drill.empty} />
          <Link href={backHref} className={`${buttonVariants({ variant: "outline" })} w-fit`}>
            {PREP_COPY.drill.back}
          </Link>
        </>
      )}
    </div>
  );
}
