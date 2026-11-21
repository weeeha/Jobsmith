import { notFound } from "next/navigation";

import { ListenPlayer } from "@/components/player/listen-player";
import { audioDeps } from "@/lib/audio/deps";
import { parseDocRef } from "@/lib/artifacts/tabs";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { env } from "@/lib/env";
import { audioContext } from "@/lib/prep/audio-status";
import { stepIndexForQuestion } from "@/lib/prep/engine-state";
import { loadPlayerData } from "@/lib/prep/player-data";

// A server component that only reads. The page makes no provider call: the
// clips come from the database and the player speaks the rest in the browser.
export default async function ListenPage(props: PageProps<"/jobs/[slug]/listen">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const s = scopedFor(user.id);
  const opportunity = await s.opportunity.getBySlug(slug);
  if (!opportunity) notFound();

  const ref = parseDocRef(searchParams.doc);
  if (!ref || ref.scope !== "opportunity") notFound();

  const audio = await audioContext(s, audioDeps(), env().TTS);
  const loaded = await loadPlayerData(s, { opportunityId: opportunity.id, docKey: ref.key, scope: "opportunity", audio });
  if (!loaded.ok) notFound();
  const { plan, settings, kind } = loaded.data;

  // `q` is a question number (a chapter number for a pitch); a bad one starts at the top.
  const q = typeof searchParams.q === "string" && /^\d{1,5}$/.test(searchParams.q) ? Number(searchParams.q) : null;
  const questionIndex = q === null ? -1 : plan.questions.findIndex((question) => question.number === q);
  const initialStepIndex = questionIndex < 0 ? 0 : Math.max(0, stepIndexForQuestion(plan, questionIndex));

  return (
    <ListenPlayer
      plan={plan}
      kind={kind}
      opportunityId={opportunity.id}
      speed={settings.speed}
      gapFactor={settings.gapFactor}
      browserVoices={settings.browserVoices}
      initialStepIndex={initialStepIndex}
      backHref={`/jobs/${slug}?tab=prep`}
    />
  );
}
