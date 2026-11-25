"use client";

import * as React from "react";

import { buttonVariants } from "@/components/ui/button";
import { OFFLINE_COPY } from "@/lib/offline/copy";
import { listSavedJobs, type SavedJob } from "@/lib/offline/saved-jobs";

const COPY = OFFLINE_COPY.offline;

// Plain anchors on purpose: a client-side navigation fetches a Server
// Components payload, which the worker does not store. A document load is
// answered from the saved job's cache.
const pageHref = (slug: string, leaf: "listen" | "drill" | "quick-fire", key: string) => `/jobs/${slug}/${leaf}?doc=job:${key}`;

function Row(props: { slug: string; docKey: string; title: string; leaves: ("listen" | "drill" | "quick-fire")[] }) {
  const label = { listen: COPY.listen, drill: COPY.drill, "quick-fire": COPY.quickFire } as const;
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 break-words text-sm text-foreground">{props.title}</span>
      <span className="flex flex-wrap items-center gap-2">
        {props.leaves.map((leaf, i) => (
          <a
            key={leaf}
            href={pageHref(props.slug, leaf, props.docKey)}
            aria-label={`${label[leaf]}: ${props.title}`}
            className={buttonVariants({ variant: i === 0 ? "default" : "outline", size: "sm" })}
          >
            {label[leaf]}
          </a>
        ))}
      </span>
    </li>
  );
}

/**
 * The body of /offline: says the page is not available and lists the jobs
 * saved on this device, read from Cache Storage with no network.
 */
export function OfflineNotice(props: { deps?: { caches?: CacheStorage } }): React.ReactElement {
  const [jobs, setJobs] = React.useState<SavedJob[] | null>(null);
  const deps = props.deps;

  React.useEffect(() => {
    let cancelled = false;
    const cachesApi = deps && "caches" in deps ? deps.caches : typeof caches !== "undefined" ? caches : undefined;
    (cachesApi ? listSavedJobs(cachesApi) : Promise.resolve([] as SavedJob[]))
      .catch(() => [] as SavedJob[])
      .then((found) => {
        if (!cancelled) setJobs(found);
      });
    return () => {
      cancelled = true;
    };
  }, [deps]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium text-foreground">{COPY.heading}</h1>
        <p className="text-sm text-muted-foreground">{COPY.help}</p>
      </div>
      {jobs === null ? null : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-foreground">{COPY.openHeading}</h2>
          <ul className="flex flex-col gap-3">
            {jobs.map((job) => (
              <li key={job.slug} className="min-w-0">
                <div
                  role="group"
                  aria-label={COPY.jobLabel(job.roleTitle, job.companyName)}
                  className="flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
                >
                  <h3 className="min-w-0 break-words text-sm font-medium text-foreground">{COPY.jobLabel(job.roleTitle, job.companyName)}</h3>
                  <ul className="flex flex-col gap-2">
                    {job.banks.map((bank) => (
                      <Row key={bank.key} slug={job.slug} docKey={bank.key} title={bank.title} leaves={["listen", "drill", "quick-fire"]} />
                    ))}
                    {job.pitches.map((pitch) => (
                      <Row key={pitch.key} slug={job.slug} docKey={pitch.key} title={pitch.title} leaves={["listen"]} />
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
