// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { CompareScreen } from "@/components/compare/compare-page";
import { COPY } from "@/components/compare/compare-copy";
import { diffUnits } from "@/lib/compare/diff";
import { unitsForDiff } from "@/lib/compare/units";
import type { Comparison, CompareVersion } from "@/lib/compare/load";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const doc = { scope: "opportunity", key: "cl" } as const;

function version(n: number, bodyMd: string, over: Partial<CompareVersion> = {}): CompareVersion {
  return {
    version: n,
    kind: "cover_letter",
    title: "Letter",
    origin: "pushed",
    createdAt: new Date("2026-10-05T12:00:00Z"),
    editedAt: null,
    sentAt: null,
    bodyMd,
    ...over,
  };
}

function comparison(a: CompareVersion, b: CompareVersion, mode: Comparison["mode"]): Comparison {
  const result = diffUnits(unitsForDiff(a.bodyMd), unitsForDiff(b.bodyMd));
  const versions = [a, b].map((v) => ({ version: v.version, origin: v.origin, editedAt: v.editedAt })) as never;
  return {
    title: "Letter",
    versions,
    a,
    b,
    mode,
    diff: mode === "diff" && result.ok ? result : null,
    notice: null,
  };
}

function renderScreen(c: Comparison, view: "split" | "inline" | null = null) {
  return render(
    <LiveAnnouncerProvider>
      <CompareScreen comparison={c} view={view} basePath="/jobs/x/compare" doc={doc} backHref="/jobs/x?tab=documents&doc=job:cl" />
    </LiveAnnouncerProvider>,
  );
}

describe("CompareScreen", () => {
  const a = version(3, "# L\nHello there friend.\n", { editedAt: new Date("2026-10-02T12:00:00Z") });
  const b = version(4, "# L\nHello wonderful world.\n");

  it("header names both versions and the summary", () => {
    const { container } = renderScreen(comparison(a, b, "diff"));
    const text = container.querySelector("header p")!.textContent!;
    expect(text).toMatch(/^Version 3 \(edited .*2.*\) and version 4 \(pushed .*5.*\) · \d+ words? added, \d+ removed, 1 section changed/);
    expect(container.querySelectorAll("time")).toHaveLength(2);
  });

  it("both views are in the DOM, the other hidden by classes", () => {
    const auto = renderScreen(comparison(a, b, "diff")).container;
    expect(auto.querySelector('[data-view="split"]')!.parentElement!.className).toBe("hidden lg:block");
    expect(auto.querySelector('[data-view="inline"]')!.parentElement!.className).toBe("lg:hidden");
  });

  it("an explicit view overrides the breakpoint", () => {
    const { container } = renderScreen(comparison(a, b, "diff"), "inline");
    expect(container.querySelector('[data-view="split"]')!.parentElement!.className).toBe("hidden");
    expect(container.querySelector('[data-view="inline"]')!.parentElement!.className).toBe("block");
  });

  it("equal versions say to pick two and still show the pickers", () => {
    renderScreen(comparison(b, b, "same"));
    expect(screen.getByText(COPY.pickDifferent)).toBeTruthy();
    expect(screen.getAllByLabelText("Older version").length).toBeGreaterThan(0);
  });

  it("too_different shows both versions in full with the sentence", () => {
    const { container } = renderScreen(comparison(a, b, "too_different"));
    expect(screen.getByText(COPY.tooDifferent)).toBeTruthy();
    expect(container.textContent).toContain("Hello there friend.");
    expect(container.textContent).toContain("Hello wonderful world.");
    expect(container.querySelector("[data-change]")).toBeNull();
  });

  it("links back to the document and keeps change blocks out of fixed positioning", () => {
    const { container } = renderScreen(comparison(a, b, "diff"));
    expect(screen.getByText("Back to the document").getAttribute("href")).toBe("/jobs/x?tab=documents&doc=job:cl");
    for (const el of container.querySelectorAll("[data-change]")) expect(el.closest(".fixed")).toBeNull();
  });
});
