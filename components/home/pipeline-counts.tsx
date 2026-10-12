import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { HOME_MESSAGES } from "@/lib/attention/messages";
import type { PipelineCount } from "@/lib/home/read";

export function PipelineCounts({ counts }: { counts: PipelineCount[] }) {
  return (
    <section aria-labelledby="home-pipeline" className="flex flex-col gap-3">
      <h2 id="home-pipeline" className="text-base font-semibold text-foreground">
        Pipeline
      </h2>
      <ul className="flex flex-col divide-y rounded-lg border">
        {counts.map((entry) => (
          <li key={entry.kind} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="text-foreground">{entry.label}</span>
            <span className="text-muted-foreground tabular-nums">{entry.count}</span>
          </li>
        ))}
      </ul>
      <Link href="/board" className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}>
        {HOME_MESSAGES.openBoard}
      </Link>
    </section>
  );
}
