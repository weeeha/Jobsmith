import { describe, expect, it } from "vitest";
import { resolvePosting, needsTextReasonFor } from "@/lib/intake/resolve";
import { fakeGuardedFetch, readFixture } from "../helpers/intake";
import { createFakeDriver } from "@/lib/ai/fake";
import { matchAtsUrl, atsApiRequest } from "@/lib/intake/ats/match";
import type { FetchFailure } from "@/lib/intake/fetch-guard";

describe("needsTextReasonFor", () => {
  const cases: Array<[FetchFailure | "unreadable", string]> = [
    ["invalid_url", "blocked"],
    ["blocked_scheme", "blocked"],
    ["blocked_port", "blocked"],
    ["blocked_address", "blocked"],
    ["timeout", "timeout"],
    ["too_large", "too_large"],
    ["not_found", "not_found"],
    ["unsupported_type", "unreadable"],
    ["unreadable", "unreadable"],
    ["dns_failed", "fetch_failed"],
    ["too_many_redirects", "fetch_failed"],
    ["http_error", "fetch_failed"],
    ["network_error", "fetch_failed"],
  ];
  it.each(cases)("%s -> %s", (failure, expected) => {
    expect(needsTextReasonFor(failure)).toBe(expected);
  });
});

describe("resolvePosting", () => {
  const ghJson = readFixture("greenhouse-job.json");
  const ghUrl = (JSON.parse(ghJson) as { absolute_url: string }).absolute_url;
  const ghRef = matchAtsUrl(ghUrl)!;
  const ghRequest = atsApiRequest(ghRef);

  it("resolves an ATS link with no model call", async () => {
    const fetch = fakeGuardedFetch({ [ghRequest.url]: { contentType: "json", body: ghJson } });
    const driver = createFakeDriver();
    const outcome = await resolvePosting({ url: ghUrl, userId: "u1" }, { fetch, ai: driver });
    expect(outcome).toEqual({
      kind: "resolved",
      posting: {
        source: "url",
        via: "greenhouse",
        sourceUrl: ghUrl,
        bodyMd: "## About the role\n\nNorthwind Traders builds tools for warehouse teams.\n\n## What you will do\n\n- Run discovery.\n- Ship weekly.",
        fields: { companyName: "Northwind Traders", roleTitle: "Senior Product Designer", location: "Rotterdam, Netherlands (Hybrid)", workMode: "hybrid", compMin: null, compMax: null, compCurrency: null },
        extraction: "ats",
        needsReview: false,
        ats: { kind: "greenhouse", org: "northwindtraders" },
      },
      fetchFailure: null,
    });
    expect(driver.calls).toHaveLength(0);
  });

  it("an ATS 404 with no text gives needs_text not_found", async () => {
    const fetch = fakeGuardedFetch({ [ghRequest.url]: "not_found" });
    const outcome = await resolvePosting({ url: ghUrl, userId: "u1" }, { fetch, ai: null });
    expect(outcome).toEqual({ kind: "needs_text", reason: "not_found", fetchFailure: "not_found" });
  });

  it("an ATS failure with text continues on the text path, keeping the fetch failure", async () => {
    const fetch = fakeGuardedFetch({ [ghRequest.url]: "not_found" });
    const driver = createFakeDriver();
    const outcome = await resolvePosting({ url: ghUrl, text: "Company: Northwind Traders\nRole: Designer", userId: "u1" }, { fetch, ai: driver });
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") throw new Error("expected resolved");
    expect(outcome.posting.source).toBe("text");
    expect(outcome.posting.sourceUrl).toBe(ghUrl);
    expect(outcome.fetchFailure).toBe("not_found");
  });

  // The known trap: fetchAtsPosting's own "unreadable" code (invalid JSON,
  // or a mapping that came back null) is not a FetchFailure. Without text,
  // the reason is still "unreadable" via needsTextReasonFor, but
  // fetchFailure must be null - no network failure happened.
  it("an ATS 'unreadable' failure (invalid JSON) gives reason unreadable but a null fetchFailure", async () => {
    const fetch = fakeGuardedFetch({ [ghRequest.url]: { contentType: "json", body: "{not valid json" } });
    const outcome = await resolvePosting({ url: ghUrl, userId: "u1" }, { fetch, ai: null });
    expect(outcome).toEqual({ kind: "needs_text", reason: "unreadable", fetchFailure: null });
  });

  it("the same 'unreadable' ATS failure, with text given, resolves via text with fetchFailure still null", async () => {
    const fetch = fakeGuardedFetch({ [ghRequest.url]: { contentType: "json", body: "{not valid json" } });
    const driver = createFakeDriver();
    const outcome = await resolvePosting({ url: ghUrl, text: "Company: Northwind Traders\nRole: Designer", userId: "u1" }, { fetch, ai: driver });
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") throw new Error("expected resolved");
    expect(outcome.fetchFailure).toBeNull();
  });

  it("text with a non-ATS link keeps the link as sourceUrl but never fetches it", async () => {
    const fetch = fakeGuardedFetch({});
    const outcome = await resolvePosting({ url: "https://example.org/careers/123", text: "Company: Northwind Traders\nRole: Designer", userId: "u1" }, { fetch, ai: null });
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") throw new Error("expected resolved");
    expect(outcome.posting.sourceUrl).toBe("https://example.org/careers/123");
    expect(fetch.calls).toHaveLength(0);
  });

  it("a LinkedIn link makes no request at all", async () => {
    const fetch = fakeGuardedFetch({});
    const outcome = await resolvePosting({ url: "https://www.linkedin.com/jobs/view/1000000001/", userId: "u1" }, { fetch, ai: null });
    expect(outcome).toEqual({ kind: "needs_text", reason: "login_required", fetchFailure: null });
    expect(fetch.calls).toHaveLength(0);
  });

  it("a page with complete JSON-LD resolves with no model call", async () => {
    const html = readFixture("job-page.html");
    const url = "https://example.org/careers/product-designer";
    const fetch = fakeGuardedFetch({ [url]: { contentType: "html", body: html } });
    const driver = createFakeDriver();
    const outcome = await resolvePosting({ url, userId: "u1" }, { fetch, ai: driver });
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") throw new Error("expected resolved");
    expect(outcome.posting.extraction).toBe("json_ld");
    expect(outcome.posting.fields).toMatchObject({ companyName: "Northwind Traders", roleTitle: "Product Designer, Warehouse Tools", workMode: "remote" });
    expect(driver.calls).toHaveLength(0);
  });

  it("a page with no JSON-LD reads through Readability and the model", async () => {
    const html = readFixture("job-page-no-jsonld.html");
    const url = "https://example.org/careers/product-designer";
    const fetch = fakeGuardedFetch({ [url]: { contentType: "html", body: html } });
    const driver = createFakeDriver({
      extract_posting: () => ({ companyName: "Northwind Traders", roleTitle: "Product Designer, Warehouse Tools", location: null, workMode: null, compMin: null, compMax: null, compCurrency: null }),
    });
    const outcome = await resolvePosting({ url, userId: "u1" }, { fetch, ai: driver });
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") throw new Error("expected resolved");
    expect(outcome.posting.via).toBe("page");
    expect(outcome.posting.extraction).toBe("ai");
    expect(outcome.posting.needsReview).toBe(false);
    expect(outcome.posting.fields.companyName).toBe("Northwind Traders");
    expect(driver.calls).toHaveLength(1);
  });

  it("JSON-LD fills the company the model left null, promoting an otherwise-incomplete model result to ai", async () => {
    // JSON-LD here has no "title" key at all, so jobPostingFromJsonLd's
    // roleTitle is null and jsonLdHasCompanyAndRole is false: this does NOT
    // qualify for the no-model short-circuit above (that requires JSON-LD to
    // already have *both* fields), so the model branch runs. The model
    // itself finds only the role (no company), which alone would be
    // ai_incomplete; JSON-LD's company completes it.
    const html = `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", hiringOrganization: { "@type": "Organization", name: "Northwind Traders" }, description: "short" })}</script>
</head><body><main><article><h1>Product Designer</h1><p>${"We build tools for warehouse teams and ship weekly. ".repeat(20)}</p></article></main></body></html>`;
    const url = "https://example.org/careers/jsonld-completes-model";
    const fetch = fakeGuardedFetch({ [url]: { contentType: "html", body: html } });
    const driver = createFakeDriver({ extract_posting: () => ({ companyName: null, roleTitle: "Product Designer", location: "Berlin", workMode: null, compMin: null, compMax: null, compCurrency: null }) });
    const outcome = await resolvePosting({ url, userId: "u1" }, { fetch, ai: driver });
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") throw new Error("expected resolved");
    expect(outcome.posting.extraction).toBe("ai");
    expect(outcome.posting.fields).toMatchObject({ companyName: "Northwind Traders", roleTitle: "Product Designer", location: "Berlin" });
    expect(driver.calls).toHaveLength(1);
  });

  it("the login wall gives too_short (it is not a login-walled host, just short)", async () => {
    const html = readFixture("login-wall.html");
    const url = "https://example.org/careers/login-wall-but-not-linkedin";
    const fetch = fakeGuardedFetch({ [url]: { contentType: "html", body: html } });
    const outcome = await resolvePosting({ url, userId: "u1" }, { fetch, ai: null });
    expect(outcome).toEqual({ kind: "needs_text", reason: "too_short", fetchFailure: null });
  });

  it("a page with AI off gives ai_off and needsReview true", async () => {
    const html = readFixture("job-page-no-jsonld.html");
    const url = "https://example.org/careers/no-ai";
    const fetch = fakeGuardedFetch({ [url]: { contentType: "html", body: html } });
    const outcome = await resolvePosting({ url, userId: "u1" }, { fetch, ai: null });
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") throw new Error("expected resolved");
    expect(outcome.posting.extraction).toBe("ai_off");
    expect(outcome.posting.needsReview).toBe(true);
  });

  it("a page whose model call errors gives ai_failed and needsReview true", async () => {
    const html = readFixture("job-page-no-jsonld.html");
    const url = "https://example.org/careers/ai-failed";
    const fetch = fakeGuardedFetch({ [url]: { contentType: "html", body: html } });
    const driver = createFakeDriver({ extract_posting: () => ({ error: "ai_error" }) });
    const outcome = await resolvePosting({ url, userId: "u1" }, { fetch, ai: driver });
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") throw new Error("expected resolved");
    expect(outcome.posting.extraction).toBe("ai_failed");
    expect(outcome.posting.needsReview).toBe(true);
  });

  it("pasted text whose model result stays incomplete gives ai_incomplete and needsReview true", async () => {
    const text = readFixture("pasted-posting-plain.txt");
    const driver = createFakeDriver({
      extract_posting: () => ({ companyName: null, roleTitle: null, location: null, workMode: null, compMin: null, compMax: null, compCurrency: null }),
    });
    const outcome = await resolvePosting({ text, userId: "u1" }, { fetch: fakeGuardedFetch({}), ai: driver });
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") throw new Error("expected resolved");
    expect(outcome.posting.extraction).toBe("ai_incomplete");
    expect(outcome.posting.needsReview).toBe(true);
  });
});
