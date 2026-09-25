import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { loadCompanyOverviews } from "@/lib/companies/load";
import { formatDocRef } from "@/lib/artifacts/tabs";
import { EmptyState } from "@/components/super-ai/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CompaniesPage() {
  const user = await requireUser();
  const s = scopedFor(user.id);
  const companies = await loadCompanyOverviews(s);

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Companies</h1>
      {companies.length === 0 ? (
        <EmptyState
          size="page"
          title="No companies yet."
          description="Companies appear here when you add a job."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {companies.map((company) => (
            <li key={company.id}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2 className="break-words text-base font-medium text-foreground">{company.name}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {company.jobs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No jobs.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {company.jobs.map((job) => (
                        <li key={job.slug} className="break-words text-sm">
                          <Link
                            href={`/jobs/${job.slug}`}
                            className="rounded-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {job.roleTitle}
                          </Link>{" "}
                          <span className="text-muted-foreground">{job.stageLabel}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {company.research.length > 0 ? (
                    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                      <h3 className="text-sm font-medium text-foreground">Shared research</h3>
                      <ul className="flex flex-col gap-1.5">
                        {company.research.map((doc) => (
                          <li key={doc.key} className="break-words text-sm">
                            <Link
                              href={`/jobs/${doc.jobSlug}?tab=research&doc=${formatDocRef({ scope: "company", key: doc.key })}`}
                              className="rounded-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {doc.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
