import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readablePage } from "@/lib/intake/readable";
import { MIN_POSTING_TEXT } from "@/lib/intake/values";

function readFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests/fixtures/intake", name), "utf-8");
}

describe("readablePage", () => {
  it("reads company, role and work mode from JSON-LD on job-page.html", () => {
    const result = readablePage(readFixture("job-page.html"));
    expect(result.jsonLd).not.toBeNull();
    expect(result.jsonLd?.companyName).toBe("Northwind Traders");
    expect(result.jsonLd?.roleTitle).toBe("Product Designer, Warehouse Tools");
    expect(result.jsonLd?.workMode).toBe("remote");
  });

  it("has at least MIN_POSTING_TEXT visible characters of body on job-page.html", () => {
    const result = readablePage(readFixture("job-page.html"));
    expect(result.textLength).toBeGreaterThanOrEqual(MIN_POSTING_TEXT);
  });

  it("finds no JSON-LD and falls back to Readability on job-page-no-jsonld.html", () => {
    const result = readablePage(readFixture("job-page-no-jsonld.html"));
    expect(result.jsonLd).toBeNull();
    expect(result.bodyMd).toContain("## What you will do");
  });

  it("drops the nav, the cookie banner and the footer form on job-page-no-jsonld.html", () => {
    const result = readablePage(readFixture("job-page-no-jsonld.html"));
    expect(result.bodyMd).not.toContain("About us");
    expect(result.bodyMd).not.toContain("Accept all");
    expect(result.bodyMd).not.toContain("Subscribe");
  });

  it("keeps the apply link as markdown on job-page-no-jsonld.html", () => {
    const result = readablePage(readFixture("job-page-no-jsonld.html"));
    expect(result.bodyMd).toContain("[Apply now](https://example.org/apply)");
  });

  it("is under MIN_POSTING_TEXT visible characters on the login wall", () => {
    const result = readablePage(readFixture("login-wall.html"));
    expect(result.textLength).toBeLessThan(MIN_POSTING_TEXT);
  });
});
