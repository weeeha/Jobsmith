import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { addJob } from "@/lib/intake/add-job";
import { encodeDraft } from "@/lib/intake/form";
import { fakeGuardedFetch, readFixture } from "../helpers/intake";
import { createFakeDriver } from "@/lib/ai/fake";
import { matchAtsUrl, atsApiRequest } from "@/lib/intake/ats/match";
import type { AddJobDeps } from "@/lib/intake/deps";

const NOW = new Date("2026-09-19T12:00:00.000Z");

function deps(overrides: Partial<AddJobDeps>): AddJobDeps {
  return { fetch: fakeGuardedFetch({}), ai: null, now: () => NOW, requestId: "test-request", ...overrides };
}

describe("addJob", () => {
  it("creates a job straight from the Greenhouse fixture with no AI driver, tagging the company with its ATS", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "gh@example.com");
      const s = scoped(db, user.id);
      const ghJson = readFixture("greenhouse-job.json");
      const ghUrl = (JSON.parse(ghJson) as { absolute_url: string }).absolute_url;
      const request = atsApiRequest(matchAtsUrl(ghUrl)!);
      const fetch = fakeGuardedFetch({ [request.url]: { contentType: "json", body: ghJson } });

      const result = await addJob(s, user.id, { sourceUrl: ghUrl }, deps({ fetch }));

      expect(result.kind).toBe("added");
      if (result.kind !== "added") throw new Error("expected added");
      expect(result.note).toBe("none");
      const opportunity = await s.opportunity.getById(result.id);
      expect(opportunity).toMatchObject({
        roleTitle: "Senior Product Designer",
        location: "Rotterdam, Netherlands (Hybrid)",
        workMode: "hybrid",
        source: "url",
        sourceUrl: ghUrl,
        needsReview: false,
      });
      expect(opportunity?.postingMd).toContain("## About the role");
      const company = await s.company.getById(opportunity!.companyId);
      expect(company).toMatchObject({ name: "Northwind Traders", atsKind: "greenhouse", atsOrg: "northwindtraders" });
    } finally {
      await close();
    }
  });

  it("creates a job from the labeled pasted-posting fixture through the fake driver, with no review flag", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "paste@example.com");
      const s = scoped(db, user.id);
      const text = readFixture("pasted-posting.txt");

      const result = await addJob(s, user.id, { postingText: text }, deps({ ai: createFakeDriver() }));

      expect(result.kind).toBe("added");
      if (result.kind !== "added") throw new Error("expected added");
      expect(result.note).toBe("none");
      const opportunity = await s.opportunity.getById(result.id);
      expect(opportunity).toMatchObject({ roleTitle: "Product Designer", location: "Rotterdam", workMode: "hybrid", source: "text", needsReview: false });
    } finally {
      await close();
    }
  });

  it("pasted plain text with no AI gives needs_details ai_off; resubmitting with typed fields and the draft creates the job flagged for review", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "plain@example.com");
      const s = scoped(db, user.id);
      const text = readFixture("pasted-posting-plain.txt");
      const d = deps({});

      const first = await addJob(s, user.id, { postingText: text }, d);
      expect(first.kind).toBe("needs_details");
      if (first.kind !== "needs_details") throw new Error("expected needs_details");
      expect(first.reason).toBe("ai_off");
      expect([...first.missing].sort()).toEqual(["companyName", "roleTitle"]);

      const draft = encodeDraft(first.draft);
      const second = await addJob(
        s,
        user.id,
        { postingText: text, companyName: "Northwind Traders", roleTitle: "Product Designer", draft },
        d,
      );
      expect(second.kind).toBe("added");
      if (second.kind !== "added") throw new Error("expected added");
      expect(second.note).toBe("review");
      expect((await s.opportunity.getById(second.id))?.needsReview).toBe(true);
    } finally {
      await close();
    }
  });

  it("a page link with no AI gives needs_details ai_off; resubmitting with typed fields and the draft reuses it without a second fetch", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "page@example.com");
      const s = scoped(db, user.id);
      const html = readFixture("job-page-no-jsonld.html");
      const url = "https://example.org/careers/product-designer";
      const fetch = fakeGuardedFetch({ [url]: { contentType: "html", body: html } });
      const d = deps({ fetch });

      const first = await addJob(s, user.id, { sourceUrl: url }, d);
      expect(first.kind).toBe("needs_details");
      if (first.kind !== "needs_details") throw new Error("expected needs_details");
      expect(fetch.calls).toHaveLength(1);

      const draft = encodeDraft(first.draft);
      const second = await addJob(
        s,
        user.id,
        { sourceUrl: url, companyName: "Northwind Traders", roleTitle: "Product Designer, Warehouse Tools", draft },
        d,
      );
      expect(second.kind).toBe("added");
      if (second.kind !== "added") throw new Error("expected added");
      const opportunity = await s.opportunity.getById(second.id);
      expect(opportunity?.postingMd).toContain("## What you will do");
      expect(fetch.calls).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("a LinkedIn link with typed company and role saves the link only, with no posting snapshot", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "linkedin@example.com");
      const s = scoped(db, user.id);

      const result = await addJob(
        s,
        user.id,
        { sourceUrl: "https://www.linkedin.com/jobs/view/1000000001/", companyName: "Northwind Traders", roleTitle: "Product Designer" },
        deps({}),
      );

      expect(result.kind).toBe("added");
      if (result.kind !== "added") throw new Error("expected added");
      expect(result.note).toBe("link_only");
      const opportunity = await s.opportunity.getById(result.id);
      expect(opportunity).toMatchObject({ source: "manual", sourceUrl: "https://www.linkedin.com/jobs/view/1000000001/", needsReview: false });
      expect(opportunity?.postingMd).toBeNull();
    } finally {
      await close();
    }
  });

  it("a link that fails to read, with no typed company or role, gives needs_text and creates nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "failing@example.com");
      const s = scoped(db, user.id);
      const url = "https://example.org/careers/missing";
      const fetch = fakeGuardedFetch({ [url]: "not_found" });

      const result = await addJob(s, user.id, { sourceUrl: url }, deps({ fetch }));

      expect(result).toEqual({ kind: "needs_text", reason: "not_found" });
      expect(await s.opportunity.listBoard()).toEqual([]);
    } finally {
      await close();
    }
  });

  it("warns on a duplicate and creates a second job when add_anyway is set", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "dup@example.com");
      const s = scoped(db, user.id);
      const d = deps({});

      const first = await addJob(s, user.id, { companyName: "Northwind Traders", roleTitle: "Product Designer" }, d);
      expect(first.kind).toBe("added");
      if (first.kind !== "added") throw new Error("expected added");

      const second = await addJob(s, user.id, { companyName: "Northwind Traders", roleTitle: "Product Designer" }, d);
      expect(second.kind).toBe("duplicate");
      if (second.kind !== "duplicate") throw new Error("expected duplicate");
      expect(second.existingSlug).toBe(first.slug);

      const third = await addJob(s, user.id, { companyName: "Northwind Traders", roleTitle: "Product Designer", intent: "add_anyway" }, d);
      expect(third.kind).toBe("added");
      expect(await s.opportunity.listBoard()).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("an invalid draft is ignored and the posting resolves again", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "baddraft@example.com");
      const s = scoped(db, user.id);
      const text = readFixture("pasted-posting.txt");

      const result = await addJob(s, user.id, { postingText: text, draft: "{not valid json" }, deps({ ai: createFakeDriver() }));

      expect(result.kind).toBe("added");
      if (result.kind !== "added") throw new Error("expected added");
      expect((await s.opportunity.getById(result.id))?.roleTitle).toBe("Product Designer");
    } finally {
      await close();
    }
  });
});
