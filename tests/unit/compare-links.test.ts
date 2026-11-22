import { describe, expect, it } from "vitest";
import { backHrefFromCompareUrl, documentHrefForJob } from "@/lib/compare/links";

describe("compare links", () => {
  it("documentHrefForJob builds the job page document URL", () => {
    expect(documentHrefForJob("acme-designer", { scope: "opportunity", key: "cl" }, "documents")).toBe(
      "/jobs/acme-designer?tab=documents&doc=job:cl",
    );
    expect(documentHrefForJob("acme-designer", { scope: "company", key: "recon" }, "research")).toBe(
      "/jobs/acme-designer?tab=research&doc=company:recon",
    );
  });

  it("backHrefFromCompareUrl reads the doc out of a compare URL", () => {
    expect(backHrefFromCompareUrl("/jobs/x/compare", new URLSearchParams("doc=job:cv&a=1&b=9"))).toBe(
      "/jobs/x?tab=documents&doc=job:cv",
    );
    expect(backHrefFromCompareUrl("/jobs/x/compare", new URLSearchParams("doc=company:recon"))).toBe(
      "/jobs/x?tab=research&doc=company:recon",
    );
    expect(backHrefFromCompareUrl("/jobs/x/compare", new URLSearchParams("doc=bad"))).toBe("/jobs/x");
    const id = "11111111-1111-4111-8111-111111111111";
    expect(backHrefFromCompareUrl(`/companies/${id}/compare`, new URLSearchParams("doc=recon"))).toBe(
      `/companies/${id}?doc=recon`,
    );
    expect(backHrefFromCompareUrl("/elsewhere", new URLSearchParams())).toBeNull();
  });
});
