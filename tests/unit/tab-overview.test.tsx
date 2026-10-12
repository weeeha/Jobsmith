// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ scoreFitAction: vi.fn(), updateCompanyDetailsAction: vi.fn() }));

import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { TabOverview } from "@/components/job/tab-overview";
import type { FitCardModel } from "@/lib/fit/card";
import type { CompanyRow } from "@/lib/db/scoped";

const FIT: FitCardModel = {
  opportunityId: "00000000-0000-4000-8000-000000000001",
  roleTitle: "Product Designer",
  companyName: "Northwind Traders",
  view: "none",
  readiness: "ready",
  fit: null,
  band: null,
  threshold: 70,
  profileChangedSince: false,
  hardFilters: { pass: true, failed: [], unchecked: [] },
  hasHardFilters: false,
};

const COMPANY = {
  id: "00000000-0000-4000-8000-0000000000c1",
  name: "Northwind Traders",
  domain: null,
  careersUrl: null,
  size: null,
  industry: null,
  hq: null,
  notesMd: null,
} as unknown as CompanyRow;

describe("TabOverview", () => {
  it("puts the fit card before the posting, pay and company sections", () => {
    render(
      <LiveAnnouncerProvider>
        <TabOverview
          opportunity={{
            postingMd: "About the job",
            postingCapturedAt: null,
            compMin: null,
            compMax: null,
            compCurrency: null,
            compNote: null,
            myAsk: null,
          }}
          company={COMPANY}
          opportunityId={FIT.opportunityId}
          fit={FIT}
        />
      </LiveAnnouncerProvider>,
    );
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Fit", "Posting", "Pay", "Company"]);
  });
});
