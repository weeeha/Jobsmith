// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VersionList } from "@/components/job/version-list";
import type { ArtifactMeta } from "@/lib/db/scoped";

function meta(version: number, origin: "pushed" | "pasted" | "edited" = "pushed", editedAt: Date | null = null): ArtifactMeta {
  return {
    id: `id-${version}`,
    version,
    origin,
    createdAt: new Date("2026-11-01T10:00:00Z"),
    editedAt,
    sentAt: null,
  } as unknown as ArtifactMeta;
}

const docRef = { scope: "opportunity", key: "cv" } as const;

function renderList(versions: ArtifactMeta[]) {
  return render(
    <VersionList
      title="Northwind CV"
      documentKey="cv"
      basePath="/jobs/northwind"
      docRef={docRef}
      compareBasePath="/jobs/northwind/compare"
      versions={versions}
    />,
  );
}

describe("VersionList compare links", () => {
  it("each version entry has a Compare link to the previous version; the first has none", () => {
    renderList([meta(1), meta(2), meta(3)]);
    const links = screen.getAllByRole("link", { name: /^Compare version/ });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/jobs/northwind/compare?doc=job:cv&a=2&b=3",
      "/jobs/northwind/compare?doc=job:cv&a=1&b=2",
    ]);
  });

  it("the edited-base notice is a See what changed link", () => {
    renderList([meta(1), meta(2, "edited", new Date("2026-11-02T10:00:00Z")), meta(3)]);
    const link = screen.getByRole("link", { name: "See what changed" });
    expect(link.getAttribute("href")).toBe("/jobs/northwind/compare?doc=job:cv&a=2&b=3");
    expect(screen.getByText(/Pushed after you edited version 2\./)).toBeTruthy();
  });
});
