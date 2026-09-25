import { describe, expect, it } from "vitest";
import { addJobFormSchema, encodeDraft, decodeDraft } from "@/lib/intake/form";
import { mergeFields } from "@/lib/intake/add-job";
import { draftFor } from "@/lib/intake/state";
import type { ResolvedPosting } from "@/lib/intake/resolve";

describe("addJobFormSchema", () => {
  it("rejects a sourceUrl that does not start with http or https", () => {
    const result = addJobFormSchema.safeParse({ sourceUrl: "ftp://example.org" });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe("Enter a link that starts with http or https.");
  });

  it("rejects a sourceUrl over 2,048 characters", () => {
    const result = addJobFormSchema.safeParse({ sourceUrl: `https://example.org/${"a".repeat(2100)}` });
    expect(!result.success && result.error.issues[0]?.message).toBe("Keep the link under 2,048 characters.");
  });

  it("rejects posting text over 100,000 characters", () => {
    const result = addJobFormSchema.safeParse({ postingText: "x".repeat(100_001) });
    expect(!result.success && result.error.issues[0]?.message).toBe("Keep the posting text under 100,000 characters.");
  });

  it("reuses Enter a company name. and Enter a role. for blank typed fields", () => {
    const result = addJobFormSchema.safeParse({ companyName: "  ", roleTitle: "  " });
    expect(!result.success && result.error.issues.map((i) => i.message)).toEqual([
      "Enter a company name.",
      "Enter a role.",
    ]);
  });

  it("rejects an unknown whereIsItNow value", () => {
    const result = addJobFormSchema.safeParse({ whereIsItNow: "not_a_stage" });
    expect(!result.success && result.error.issues[0]?.message).toBe("Choose a stage from the list.");
  });

  it("rejects compMax below compMin, on the compMax field", () => {
    const result = addJobFormSchema.safeParse({ compMin: 150000, compMax: 100000 });
    expect(!result.success && result.error.issues[0]).toMatchObject({ path: ["compMax"], message: "Pay to must be at least pay from." });
  });

  it("accepts an empty object: every field is optional", () => {
    expect(addJobFormSchema.safeParse({}).success).toBe(true);
  });
});

const posting: ResolvedPosting = {
  source: "url",
  via: "greenhouse",
  sourceUrl: "https://job-boards.greenhouse.io/northwindtraders/jobs/4000000001",
  bodyMd: "## About the role\n\nNorthwind Traders builds tools for warehouse teams.",
  fields: { companyName: "Northwind Traders", roleTitle: "Senior Product Designer", location: "Rotterdam, Netherlands (Hybrid)", workMode: "hybrid", compMin: null, compMax: null, compCurrency: null },
  extraction: "ats",
  needsReview: false,
  ats: { kind: "greenhouse", org: "northwindtraders" },
};

describe("encodeDraft / decodeDraft", () => {
  it("round-trips a resolved posting", () => {
    expect(decodeDraft(encodeDraft(posting))).toEqual(posting);
  });

  it("gives null for undefined or a blank string", () => {
    expect(decodeDraft(undefined)).toBeNull();
    expect(decodeDraft("")).toBeNull();
  });

  it("gives null for text that is not valid JSON", () => {
    expect(decodeDraft("{not valid json")).toBeNull();
  });

  it("gives null for the wrong v", () => {
    expect(decodeDraft(JSON.stringify({ ...posting, v: 2 }))).toBeNull();
  });

  it("gives null when the decoded shape fails the schema", () => {
    expect(decodeDraft(JSON.stringify({ ...posting, v: 1, sourceUrl: "not-a-url" }))).toBeNull();
  });
});

describe("draftFor", () => {
  it("is empty for an undefined state", () => {
    expect(draftFor(undefined, null)).toBe("");
  });

  it("is empty for an ok state", () => {
    expect(draftFor({ ok: true, data: { slug: "s", roleTitle: "R", companyName: "C", note: "none" } }, null)).toBe("");
  });

  it("is the state's draft when it does not equal dropped", () => {
    expect(draftFor({ ok: false, code: "needs_details", message: "m", draft: "DRAFT1" }, null)).toBe("DRAFT1");
  });

  it("is empty when the state's draft equals dropped", () => {
    expect(draftFor({ ok: false, code: "needs_details", message: "m", draft: "DRAFT1" }, "DRAFT1")).toBe("");
  });

  it("is empty for a failure state with no draft", () => {
    expect(draftFor({ ok: false, code: "invalid", message: "m" }, null)).toBe("");
  });
});

describe("mergeFields", () => {
  const resolved = { companyName: "Northwind Traders", roleTitle: "Product Designer", location: "Rotterdam", workMode: "hybrid" as const, compMin: 90000, compMax: 110000, compCurrency: "EUR" };

  it("typed values win; resolved values fill blanks, per field", () => {
    expect(mergeFields({ companyName: "Typed Co" }, resolved)).toMatchObject({ companyName: "Typed Co", roleTitle: "Product Designer" });
  });

  it("pay is untouched when nothing pay-related was typed: the resolved pair is used", () => {
    expect(mergeFields({}, resolved)).toMatchObject({ compMin: 90000, compMax: 110000, compCurrency: "EUR" });
  });

  it("typing only Pay from uses the typed pair as a whole: Pay to becomes null, never the resolved value", () => {
    expect(mergeFields({ compMin: 95000 }, resolved)).toMatchObject({ compMin: 95000, compMax: null, compCurrency: null });
  });

  it("typing only Pay to and a currency uses those, with Pay from null", () => {
    expect(mergeFields({ compMax: 120000, compCurrency: "USD" }, resolved)).toMatchObject({ compMin: null, compMax: 120000, compCurrency: "USD" });
  });

  it("typing both pay figures uses the typed pair and currency entirely", () => {
    expect(mergeFields({ compMin: 100000, compMax: 130000, compCurrency: "USD" }, resolved)).toMatchObject({ compMin: 100000, compMax: 130000, compCurrency: "USD" });
  });
});
