import { describe, expect, it } from "vitest";
import { updateOpportunityDetailsSchema, updateCompanyDetailsSchema } from "@/lib/pipeline/details";

function firstOpportunityMessage(input: unknown): string {
  const result = updateOpportunityDetailsSchema.safeParse(input);
  if (result.success) throw new Error("expected validation to fail");
  return result.error.issues[0]!.message;
}

function firstCompanyMessage(input: unknown): string {
  const result = updateCompanyDetailsSchema.safeParse(input);
  if (result.success) throw new Error("expected validation to fail");
  return result.error.issues[0]!.message;
}

describe("updateOpportunityDetailsSchema plain messages", () => {
  it("gives a plain message for a blank role", () => {
    expect(firstOpportunityMessage({ roleTitle: "" })).toBe("Enter a role.");
  });

  it("gives a plain message for a blank location", () => {
    expect(firstOpportunityMessage({ location: "" })).toBe("Enter a location.");
  });

  it("gives a plain message for a bad posting link", () => {
    expect(firstOpportunityMessage({ sourceUrl: "not a url" })).toBe(
      "Enter a link that starts with http or https.",
    );
  });

  // I3: the same Postgres integer overflow as createOpportunitySchema - the
  // Edit details form can also submit a pay figure this large.
  it("rejects a pay figure above Postgres's integer maximum", () => {
    expect(firstOpportunityMessage({ compMax: 3_000_000_000 })).toBe(
      "Enter a number no greater than 2,147,483,647.",
    );
  });

  it("still allows clearing compMin and compMax with null", () => {
    expect(updateOpportunityDetailsSchema.safeParse({ compMin: null, compMax: null }).success).toBe(true);
  });

  it("gives a plain message when pay-to is below pay-from", () => {
    const result = updateOpportunityDetailsSchema.safeParse({ compMin: 200_000, compMax: 100_000 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]!.message).toBe("Pay to must be at least pay from.");
  });
});

describe("updateCompanyDetailsSchema plain messages", () => {
  it("gives a plain message for a blank website", () => {
    expect(firstCompanyMessage({ domain: "" })).toBe("Enter a website.");
  });

  it("gives a plain message for a bad careers link", () => {
    expect(firstCompanyMessage({ careersUrl: "not a url" })).toBe(
      "Enter a link that starts with http or https.",
    );
  });

  it("gives a plain message for a blank size", () => {
    expect(firstCompanyMessage({ size: "" })).toBe("Enter a company size.");
  });

  it("gives a plain message for a blank industry", () => {
    expect(firstCompanyMessage({ industry: "" })).toBe("Enter an industry.");
  });

  it("gives a plain message for a blank headquarters", () => {
    expect(firstCompanyMessage({ hq: "" })).toBe("Enter a headquarters location.");
  });

  it("still allows clearing every field with null", () => {
    expect(
      updateCompanyDetailsSchema.safeParse({
        domain: null,
        careersUrl: null,
        size: null,
        industry: null,
        hq: null,
        notesMd: null,
      }).success,
    ).toBe(true);
  });
});
