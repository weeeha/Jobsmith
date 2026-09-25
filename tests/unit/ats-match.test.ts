import { describe, expect, it } from "vitest";
import { matchAtsUrl, atsApiRequest, titleFromSlug, workModeFromText } from "@/lib/intake/ats/match";

const U = "00000000-0000-4000-8000-000000000001";

describe("matchAtsUrl", () => {
  const cases: Array<[string, unknown]> = [
    ["https://boards.greenhouse.io/northwindtraders/jobs/4000000001", { kind: "greenhouse", org: "northwindtraders", jobId: "4000000001", region: "us" }],
    ["https://job-boards.greenhouse.io/northwindtraders/jobs/4000000001?gh_src=abc#app", { kind: "greenhouse", org: "northwindtraders", jobId: "4000000001", region: "us" }],
    ["https://job-boards.eu.greenhouse.io/northwindtraders/jobs/4000000001", { kind: "greenhouse", org: "northwindtraders", jobId: "4000000001", region: "eu" }],
    ["https://boards.greenhouse.io/embed/job_app?for=northwindtraders&token=4000000001", { kind: "greenhouse", org: "northwindtraders", jobId: "4000000001", region: "us" }],
    ["https://boards.greenhouse.io/northwindtraders", null],
    ["https://boards.greenhouse.io/northwindtraders/jobs/abc", null],
    ["https://evilgreenhouse.io/northwindtraders/jobs/1", null],
    ["https://boards.greenhouse.io.evil.test/northwindtraders/jobs/1", null],
    [`https://jobs.lever.co/northwind-traders/${U}`, { kind: "lever", org: "northwind-traders", jobId: U, region: "us" }],
    [`https://jobs.lever.co/northwind-traders/${U}/apply`, { kind: "lever", org: "northwind-traders", jobId: U, region: "us" }],
    [`https://jobs.eu.lever.co/northwind-traders/${U.toUpperCase()}`, { kind: "lever", org: "northwind-traders", jobId: U, region: "eu" }],
    ["https://jobs.lever.co/northwind-traders", null],
    [`https://jobs.ashbyhq.com/Northwind%20Traders/${U}`, { kind: "ashby", org: "Northwind Traders", jobId: U, region: "us" }],
    [`https://jobs.ashbyhq.com/northwind/${U}/application`, { kind: "ashby", org: "northwind", jobId: U, region: "us" }],
    ["https://jobs.ashbyhq.com/northwind", null],
    ["https://www.linkedin.com/jobs/view/1000000001/", null],
    ["ftp://boards.greenhouse.io/northwindtraders/jobs/1", null],
    ["not a url", null],
  ];

  it.each(cases)("matches %s", (url, expected) => {
    expect(matchAtsUrl(url)).toEqual(expected);
  });
});

describe("atsApiRequest", () => {
  it("builds the Greenhouse GET URL", () => {
    const ref = matchAtsUrl("https://boards.greenhouse.io/northwindtraders/jobs/4000000001")!;
    expect(atsApiRequest(ref).url).toBe("https://boards-api.greenhouse.io/v1/boards/northwindtraders/jobs/4000000001");
  });

  it("builds the EU Greenhouse GET URL", () => {
    const ref = matchAtsUrl("https://job-boards.eu.greenhouse.io/northwindtraders/jobs/4000000001")!;
    expect(atsApiRequest(ref).url).toBe("https://boards-api.eu.greenhouse.io/v1/boards/northwindtraders/jobs/4000000001");
  });

  it("builds the Lever GET URL", () => {
    const ref = matchAtsUrl(`https://jobs.lever.co/northwind-traders/${U}`)!;
    expect(atsApiRequest(ref).url).toBe(`https://api.lever.co/v0/postings/northwind-traders/${U}?mode=json`);
  });

  it("builds a POST for Ashby, with the org and job id in the GraphQL variables", () => {
    const ref = matchAtsUrl(`https://jobs.ashbyhq.com/northwind/${U}`)!;
    const request = atsApiRequest(ref);
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body!)).toMatchObject({
      operationName: "ApiJobPosting",
      variables: { organizationHostedJobsPageName: "northwind", jobPostingId: U },
    });
  });
});

describe("titleFromSlug", () => {
  it("title-cases a hyphenated slug", () => {
    expect(titleFromSlug("northwind-traders")).toBe("Northwind Traders");
  });
});

describe("workModeFromText", () => {
  it("reads remote, hybrid and onsite from free text, and null when none match", () => {
    expect(workModeFromText("Remote - US")).toBe("remote");
    expect(workModeFromText("Berlin (Hybrid)")).toBe("hybrid");
    expect(workModeFromText("On-site, Lisbon")).toBe("onsite");
    expect(workModeFromText("Berlin")).toBeNull();
  });
});
