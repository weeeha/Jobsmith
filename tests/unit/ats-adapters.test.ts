import { describe, expect, it } from "vitest";
import { mapGreenhouse } from "@/lib/intake/ats/greenhouse";
import { mapLever } from "@/lib/intake/ats/lever";
import { mapAshby } from "@/lib/intake/ats/ashby";
import { matchAtsUrl, atsApiRequest } from "@/lib/intake/ats/match";
import { fetchAtsPosting } from "@/lib/intake/ats";
import { readFixture, fakeGuardedFetch } from "../helpers/intake";

const U = "00000000-0000-4000-8000-000000000001";

describe("mapGreenhouse", () => {
  const json = JSON.parse(readFixture("greenhouse-job.json"));
  const ref = matchAtsUrl(json.absolute_url)!;

  it("maps company, role, location and work mode", () => {
    const posting = mapGreenhouse(ref, json);
    expect(posting).toMatchObject({
      companyName: "Northwind Traders",
      companyFromSlug: false,
      roleTitle: "Senior Product Designer",
      location: "Rotterdam, Netherlands (Hybrid)",
      workMode: "hybrid",
    });
  });

  it("decodes the entity-encoded content into markdown", () => {
    const posting = mapGreenhouse(ref, json);
    expect(posting?.bodyMd).toBe(
      "## About the role\n\nNorthwind Traders builds tools for warehouse teams.\n\n## What you will do\n\n- Run discovery.\n- Ship weekly.",
    );
  });

  it("falls back to a title-cased slug when company_name is missing", () => {
    const posting = mapGreenhouse(ref, { ...json, company_name: undefined });
    expect(posting?.companyName).toBe("Northwindtraders");
    expect(posting?.companyFromSlug).toBe(true);
  });

  it("returns null when the title is missing or blank", () => {
    expect(mapGreenhouse(ref, { ...json, title: " " })).toBeNull();
  });
});

describe("mapLever", () => {
  const json = JSON.parse(readFixture("lever-posting.json"));
  const ref = matchAtsUrl(json.hostedUrl)!;

  it("always names the company from the org slug", () => {
    const posting = mapLever(ref, json);
    expect(posting?.companyName).toBe("Northwind Traders");
    expect(posting?.companyFromSlug).toBe(true);
  });

  it("reads work mode from workplaceType", () => {
    expect(mapLever(ref, json)?.workMode).toBe("remote");
  });

  it("builds the body from description, each list as its own section, then additional", () => {
    const posting = mapLever(ref, json);
    expect(posting?.bodyMd).toBe(
      "**Northwind Traders** builds tools for warehouse teams.\n\n## What you will do\n\n- Run discovery.\n- Ship weekly.\n\n## What you bring\n\n- A portfolio.\n\nWe answer every application.",
    );
  });
});

describe("mapAshby", () => {
  const json = JSON.parse(readFixture("ashby-posting.json"));
  const ref = matchAtsUrl(`https://jobs.ashbyhq.com/northwind/${U}`)!;

  it("maps company, role, location and body", () => {
    expect(mapAshby(ref, json)).toMatchObject({
      companyName: "Northwind Traders",
      roleTitle: "Design Lead",
      location: "Lisbon",
      bodyMd: "Lead the design team.",
    });
  });

  it("returns null when jobPosting is null", () => {
    expect(mapAshby(ref, { data: { jobPosting: null } })).toBeNull();
  });
});

describe("fetchAtsPosting", () => {
  it("fetches, parses and maps a Greenhouse posting with accept: json and a GET request", async () => {
    const json = JSON.parse(readFixture("greenhouse-job.json"));
    const ref = matchAtsUrl(json.absolute_url)!;
    const request = atsApiRequest(ref);
    const fetch = fakeGuardedFetch({ [request.url]: { contentType: "json", body: JSON.stringify(json) } });

    const result = await fetchAtsPosting(ref, fetch);

    expect(result.ok && result.data.companyName).toBe("Northwind Traders");
    expect(fetch.calls[0]?.options.accept).toBe("json");
    expect(fetch.calls[0]?.options.method).toBe("GET");
  });

  it("sends the Ashby request as a POST with the GraphQL body", async () => {
    const json = JSON.parse(readFixture("ashby-posting.json"));
    const ref = matchAtsUrl(`https://jobs.ashbyhq.com/northwind/${U}`)!;
    const request = atsApiRequest(ref);
    const fetch = fakeGuardedFetch({ [request.url]: { contentType: "json", body: JSON.stringify(json) } });

    const result = await fetchAtsPosting(ref, fetch);

    expect(result.ok && result.data.roleTitle).toBe("Design Lead");
    expect(fetch.calls[0]?.options.method).toBe("POST");
    expect(fetch.calls[0]?.options.body).toBe(request.body);
  });

  it("passes a guard failure straight through", async () => {
    const json = JSON.parse(readFixture("greenhouse-job.json"));
    const ref = matchAtsUrl(json.absolute_url)!;
    const request = atsApiRequest(ref);
    const fetch = fakeGuardedFetch({ [request.url]: "not_found" });

    const result = await fetchAtsPosting(ref, fetch);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("not_found");
  });

  it("gives unreadable for a body that is not valid JSON", async () => {
    const json = JSON.parse(readFixture("greenhouse-job.json"));
    const ref = matchAtsUrl(json.absolute_url)!;
    const request = atsApiRequest(ref);
    const fetch = fakeGuardedFetch({ [request.url]: { contentType: "json", body: "{not valid" } });

    const result = await fetchAtsPosting(ref, fetch);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("unreadable");
  });

  it("gives unreadable for a payload with no title", async () => {
    const json = JSON.parse(readFixture("greenhouse-job.json"));
    const ref = matchAtsUrl(json.absolute_url)!;
    const request = atsApiRequest(ref);
    const fetch = fakeGuardedFetch({ [request.url]: { contentType: "json", body: JSON.stringify({ ...json, title: " " }) } });

    const result = await fetchAtsPosting(ref, fetch);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("unreadable");
  });
});
