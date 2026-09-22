import { describe, expect, it } from "vitest";
import { companyNameKey } from "@/lib/companies/name-key";

describe("companyNameKey", () => {
  const cases: [string, string][] = [
    ["Acme, Inc.", "acme"],
    ["ACME inc", "acme"],
    ["Northwind & Co", "northwindand"],
    ["Co", "co"],
    ["Priya Raman Consulting LLC", "priyaramanconsulting"],
    ["Café Kréme", "cafekreme"],
  ];

  for (const [input, expected] of cases) {
    it(`turns ${JSON.stringify(input)} into ${JSON.stringify(expected)}`, () => {
      expect(companyNameKey(input)).toBe(expected);
    });
  }
});
