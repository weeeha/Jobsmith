import { describe, expect, it } from "vitest";
import { createOpportunitySchema } from "@/lib/pipeline/create-schema";

function firstMessage(input: unknown): string {
  const result = createOpportunitySchema.safeParse(input);
  if (result.success) throw new Error("expected validation to fail");
  return result.error.issues[0]!.message;
}

const VALID = { companyName: "Acme Robotics", roleTitle: "Product Designer" };

describe("createOpportunitySchema plain messages", () => {
  it("gives a plain message for a blank company name", () => {
    expect(firstMessage({ ...VALID, companyName: "" })).toBe("Enter a company name.");
  });

  it("gives a plain message for a blank role", () => {
    expect(firstMessage({ ...VALID, roleTitle: "" })).toBe("Enter a role.");
  });

  it("gives a plain message for a bad posting link", () => {
    expect(firstMessage({ ...VALID, sourceUrl: "not a url" })).toBe(
      "Enter a link that starts with http or https.",
    );
  });

  it("gives a plain message for an unknown work mode", () => {
    expect(firstMessage({ ...VALID, workMode: "space" })).toBe("Choose a work mode.");
  });

  it("gives a plain message for a non-numeric pay figure", () => {
    expect(firstMessage({ ...VALID, compMin: Number.NaN })).toBe("Enter a number.");
  });

  it("gives a plain message for a negative pay figure", () => {
    expect(firstMessage({ ...VALID, compMin: -1 })).toBe("Enter a number that is zero or more.");
  });

  it("gives a plain message for a non-whole pay figure", () => {
    expect(firstMessage({ ...VALID, compMin: 100.5 })).toBe("Enter a whole number.");
  });

  // 3,000,000,000 is a valid safe integer in JS but overflows Postgres's
  // `integer` column (max 2,147,483,647) - without this bound, Zod accepted
  // it and Postgres threw at insert time instead of this schema returning
  // `invalid`.
  it("rejects a pay figure above Postgres's integer maximum instead of letting it reach the database", () => {
    expect(firstMessage({ ...VALID, compMax: 3_000_000_000 })).toBe(
      "Enter a number no greater than 2,147,483,647.",
    );
  });

  it("accepts a pay figure at exactly the integer maximum", () => {
    expect(createOpportunitySchema.safeParse({ ...VALID, compMax: 2_147_483_647 }).success).toBe(true);
  });

  it("gives a plain message when pay-to is below pay-from", () => {
    const result = createOpportunitySchema.safeParse({ ...VALID, compMin: 200_000, compMax: 100_000 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]!.message).toBe("Pay to must be at least pay from.");
    expect(result.error.issues[0]!.path).toEqual(["compMax"]);
  });

  it("gives a plain message for a blank currency", () => {
    expect(firstMessage({ ...VALID, compCurrency: "" })).toBe("Enter a currency.");
  });
});
