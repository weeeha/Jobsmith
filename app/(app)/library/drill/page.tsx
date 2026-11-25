import Link from "next/link";

import { ensureLibraryAudioAction } from "@/app/(app)/library/audio-actions";
import { DrillPlayer } from "@/components/player/drill-player";
import { EmptyState } from "@/components/super-ai/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { audioDeps } from "@/lib/audio/deps";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { env } from "@/lib/env";
import { LIBRARY_COPY } from "@/lib/library/copy";
import { loadLibraryDrillData } from "@/lib/library/drill";
import { audioContext } from "@/lib/prep/audio-status";

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

// A server component that only reads: the client starts and ends the session.
// A bad query value reads as no value.
export default async function LibraryDrillPage(props: PageProps<"/library/drill">) {
  const user = await requireUser();
  const searchParams = await props.searchParams;
  const s = scopedFor(user.id);

  const n = single(searchParams.n);
  const count = n !== null && /^\d{1,2}$/.test(n) && Number(n) >= 1 && Number(n) <= 50 ? Number(n) : null;
  const onlyShaky = single(searchParams.only) === "shaky";

  const audio = await audioContext(s, audioDeps(), env().TTS);
  const loaded = await loadLibraryDrillData(s, { count, onlyShaky, audio });

  // Each request is its own run: "Drill the shaky ones again" lands on this
  // same route and React would otherwise keep the finished run's state.
  const runId = crypto.randomUUID();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">{LIBRARY_COPY.drill}</h1>
      {loaded.ok ? (
        <DrillPlayer
          key={runId}
          scope="library"
          questions={loaded.data.questions}
          sessionMeta={loaded.data.sessionMeta}
          opportunityId={null}
          slug={null}
          docRef={null}
          speed={loaded.data.settings.speed}
          browserVoices={loaded.data.settings.browserVoices}
          ensureAudio={ensureLibraryAudioAction}
        />
      ) : (
        <>
          <EmptyState size="panel" title={onlyShaky ? LIBRARY_COPY.drillEmptyShaky : LIBRARY_COPY.drillEmpty} />
          <Link href="/library" className={`${buttonVariants({ variant: "outline" })} w-fit`}>
            {LIBRARY_COPY.back}
          </Link>
        </>
      )}
    </div>
  );
}
