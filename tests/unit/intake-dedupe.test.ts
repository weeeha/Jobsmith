import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { dedupeBasis, dedupeHash, normalizeForDedupe } from "@/lib/intake/dedupe";
import { isLoginWalled } from "@/lib/intake/values";

describe("dedupeBasis", () => {
  it("normalizes the company through companyNameKey and the role/location through normalizeForDedupe", () => {
    expect(
      dedupeBasis({ companyName: "Northwind Traders, Inc.", roleTitle: "  Senior  Product Designer ", location: "Rotterdam, NL" }),
    ).toBe("northwindtraders|senior product designer|rotterdam nl");
  });

  it("uses an empty location segment when location is missing or null", () => {
    expect(dedupeBasis({ companyName: "Northwind Traders", roleTitle: "Designer" })).toBe("northwindtraders|designer|");
    expect(dedupeBasis({ companyName: "Northwind Traders", roleTitle: "Designer", location: null })).toBe("northwindtraders|designer|");
  });
});

describe("dedupeHash", () => {
  it("is the sha256 hex digest of the basis string, computed here rather than pasted", () => {
    const parts = { companyName: "Northwind Traders", roleTitle: "Designer" };
    expect(dedupeHash(parts)).toBe(createHash("sha256").update(dedupeBasis(parts), "utf8").digest("hex"));
  });

  it("is 64 hex characters long", () => {
    expect(dedupeHash({ companyName: "A", roleTitle: "B" })).toHaveLength(64);
  });

  it("gives four differently-punctuated, differently-cased equivalent inputs the same hash", () => {
    const equivalent = [
      { companyName: "Northwind Traders", roleTitle: "Product Designer", location: "Berlin" },
      { companyName: "northwind traders inc", roleTitle: "PRODUCT DESIGNER", location: " berlin " },
      { companyName: "Northwind Traders", roleTitle: "Product-Designer", location: "Berlin." },
      { companyName: "Nörthwind Traders", roleTitle: "Product Designer", location: "Berlin" },
    ];
    const hashes = new Set(equivalent.map(dedupeHash));
    expect(hashes.size).toBe(1);
  });

  it("changes when the location changes", () => {
    const base = { companyName: "Northwind Traders", roleTitle: "Product Designer" };
    expect(dedupeHash({ ...base, location: "Berlin" })).not.toBe(dedupeHash({ ...base, location: "Lisbon" }));
  });

  it("treats a missing location the same as an empty one", () => {
    const base = { companyName: "Northwind Traders", roleTitle: "Designer" };
    expect(dedupeHash(base)).toBe(dedupeHash({ ...base, location: "" }));
  });
});

describe("normalizeForDedupe", () => {
  it("turns & into ' and '", () => {
    expect(normalizeForDedupe("R&D")).toBe("r and d");
  });
});

describe("isLoginWalled", () => {
  it("is true for linkedin.com and for a subdomain of it", () => {
    expect(isLoginWalled(new URL("https://www.linkedin.com/jobs/view/1"))).toBe(true);
    expect(isLoginWalled(new URL("https://linkedin.com/jobs/view/1"))).toBe(true);
  });

  it("is false for a host that merely contains linkedin.com as a substring", () => {
    expect(isLoginWalled(new URL("https://notlinkedin.com/jobs/view/1"))).toBe(false);
  });
});
