import { DetailFields, type DetailField } from "@/components/super-ai/detail-fields";
import { EditCompanyDialogTrigger } from "@/components/job/edit-company-dialog";
import { LocalTime } from "@/components/local-time";
import type { CompanyRow } from "@/lib/db/scoped";

interface TabOverviewOpportunity {
  postingMd: string | null;
  postingCapturedAt: Date | null;
  compMin: number | null;
  compMax: number | null;
  compCurrency: string | null;
  compNote: string | null;
  myAsk: string | null;
}

/**
 * This plan's own field list, not the frame's: the frame only fixes the
 * *edit* dialog's field labels (edit-company-dialog.tsx), so this read-only
 * list reuses the same words for consistency rather than inventing new ones.
 */
function formatPayRange(min: number | null, max: number | null, currency: string | null): string {
  if (min === null && max === null) {
    return "Not set";
  }
  if (min !== null && max !== null) {
    return `${min.toLocaleString()}–${max.toLocaleString()} ${currency ?? ""}`.trim();
  }
  const value = (min ?? max)!;
  return `${value.toLocaleString()} ${currency ?? ""}`.trim();
}

export function TabOverview({
  opportunity,
  company,
  opportunityId,
}: {
  opportunity: TabOverviewOpportunity;
  company: CompanyRow;
  opportunityId: string;
}) {
  const payFields: DetailField[] = [
    { id: "range", label: "Pay range", value: formatPayRange(opportunity.compMin, opportunity.compMax, opportunity.compCurrency) },
    { id: "note", label: "Pay note", value: opportunity.compNote ?? "Not set" },
    { id: "ask", label: "My ask", value: opportunity.myAsk ?? "Not set" },
  ];

  const companyFields: DetailField[] = [
    { id: "website", label: "Website", value: company.domain ?? "Not set" },
    {
      id: "careers",
      label: "Careers page",
      value: company.careersUrl ? (
        // break-words: an unbroken long URL (named risk 3) has nowhere else
        // to wrap inside DetailFields' fixed-width value column and would
        // otherwise force page-level horizontal overflow.
        <a href={company.careersUrl} target="_blank" rel="noreferrer" className="break-words">
          {company.careersUrl}
        </a>
      ) : (
        "Not set"
      ),
    },
    { id: "size", label: "Size", value: company.size ?? "Not set" },
    { id: "industry", label: "Industry", value: company.industry ?? "Not set" },
    { id: "hq", label: "Headquarters", value: company.hq ?? "Not set" },
  ];

  return (
    <section aria-label="Overview" className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">Posting</h2>
        {opportunity.postingMd ? (
          <>
            {opportunity.postingCapturedAt ? (
              <p className="text-sm text-muted-foreground">
                Captured <LocalTime value={opportunity.postingCapturedAt} mode="date" />.
              </p>
            ) : null}
            {/* Plain text, line breaks kept, no markdown rendering until
                Milestone 3. break-words: an unbroken long string (e.g. a
                pasted URL with no spaces) has no other wrap point and
                would otherwise force page-level horizontal overflow. */}
            <div className="whitespace-pre-wrap break-words text-sm text-foreground">{opportunity.postingMd}</div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No posting text saved.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">Pay</h2>
        <DetailFields fields={payFields} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">Company</h2>
        <DetailFields fields={companyFields} />
        {company.notesMd ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-foreground">Notes</h3>
            <div className="whitespace-pre-wrap break-words text-sm text-foreground">{company.notesMd}</div>
          </div>
        ) : null}
        <div>
          <EditCompanyDialogTrigger company={company} opportunityId={opportunityId} />
        </div>
      </div>
    </section>
  );
}
