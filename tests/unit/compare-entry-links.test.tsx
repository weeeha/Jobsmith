// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompareVersionsLink } from "@/components/compare/compare-links";

describe("CompareVersionsLink", () => {
  it("appears with two or more versions and not with one", () => {
    const { rerender } = render(
      <CompareVersionsLink basePath="/jobs/n/compare" docRef={{ scope: "opportunity", key: "cv" }} versions={2} title="Northwind CV" />,
    );
    expect(screen.getByRole("link", { name: "Compare versions of Northwind CV" })).toBeTruthy();
    rerender(
      <CompareVersionsLink basePath="/jobs/n/compare" docRef={{ scope: "opportunity", key: "cv" }} versions={1} title="Northwind CV" />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("a company-scoped document on a job's tab uses doc=company:<key>", () => {
    render(
      <CompareVersionsLink basePath="/jobs/n/compare" docRef={{ scope: "company", key: "intel" }} versions={3} title="Intel" />,
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe("/jobs/n/compare?doc=company:intel");
  });
});
