// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { DrillSummary } from "@/components/player/drill-summary";
import { endSessionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import type { DrillSummary as Summary } from "@/lib/prep/drill-summary";

vi.mock("@/app/(app)/library/actions", () => ({ saveToLibraryAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/prep-actions", () => ({ endSessionAction: vi.fn() }));

const SESSION = "22222222-2222-4222-8222-222222222222";
const summary: Summary = {
  marks: [
    { questionKey: "a", question: "Tell me about yourself", level: "solid" },
    { questionKey: "b", question: "Why this role", level: "shaky" },
  ],
  skipped: 1,
  stillShaky: [
    { questionKey: "b", question: "Why this role" },
    { questionKey: "c", question: "A skipped shaky one" },
  ],
  solid: 1,
};

function renderSummary(over: Partial<React.ComponentProps<typeof DrillSummary>> = {}) {
  return render(
    <LiveAnnouncerProvider>
      <DrillSummary summary={summary} slug="northwind" docRef="job:bank" sessionId={SESSION} seen={3} {...over} />
    </LiveAnnouncerProvider>,
  );
}

beforeEach(() => {
  cleanup();
  vi.mocked(endSessionAction).mockReset();
  vi.mocked(endSessionAction).mockResolvedValue({ ok: true, data: { eventWritten: true } });
});
afterEach(cleanup);

describe("DrillSummary", () => {
  it("lists the marks given and the questions still shaky", () => {
    renderSummary();
    const marks = screen.getByRole("list", { name: "Marks given" });
    expect(marks.textContent).toContain("Tell me about yourself");
    expect(marks.textContent).toContain("Solid");
    expect(marks.textContent).toContain("Shaky");
    const shaky = screen.getByRole("list", { name: "Still shaky" });
    expect(shaky.textContent).toContain("Why this role");
    expect(shaky.textContent).toContain("A skipped shaky one");
    expect(screen.getByText(/1 skipped/)).toBeTruthy();
  });

  it("links 'Drill the shaky ones again' to ?only=shaky and keeps the document", () => {
    renderSummary();
    const link = screen.getByRole("link", { name: "Drill the shaky ones again" });
    expect(link.getAttribute("href")).toBe("/jobs/northwind/drill?doc=job:bank&only=shaky");
    cleanup();
    renderSummary({ docRef: null });
    expect(screen.getByRole("link", { name: "Drill the shaky ones again" }).getAttribute("href")).toBe("/jobs/northwind/drill?only=shaky");
  });

  it("with nothing shaky there is no again link and a line says so", () => {
    renderSummary({ summary: { ...summary, stillShaky: [] } });
    expect(screen.queryByRole("link", { name: "Drill the shaky ones again" })).toBeNull();
    expect(screen.getByText("Nothing is shaky now.")).toBeTruthy();
  });

  it("endSessionAction is called once, with seen, marked and solid counts", async () => {
    const { rerender } = renderSummary();
    await waitFor(() => expect(endSessionAction).toHaveBeenCalledTimes(1));
    expect(endSessionAction).toHaveBeenCalledWith({ id: SESSION, seen: 3, marked: 2, solid: 1 });
    rerender(
      <LiveAnnouncerProvider>
        <DrillSummary summary={summary} slug="northwind" docRef="job:bank" sessionId={SESSION} seen={3} />
      </LiveAnnouncerProvider>,
    );
    expect(endSessionAction).toHaveBeenCalledTimes(1);
  });

  it("without a session (the start call failed) it ends nothing", async () => {
    renderSummary({ sessionId: null });
    await Promise.resolve();
    expect(endSessionAction).not.toHaveBeenCalled();
  });

  it("links back to Prep", () => {
    renderSummary();
    expect(screen.getByRole("link", { name: "Back to Prep" }).getAttribute("href")).toBe("/jobs/northwind?tab=prep");
  });
});
