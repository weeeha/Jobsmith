// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import {
  focusCardLink,
  focusCardButton,
  focusColumnRegion,
  focusClosedViewToggle,
  nextFocusCandidate,
} from "@/lib/dom/board-focus";

describe("nextFocusCandidate", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("picks the item right after the removed one", () => {
    expect(nextFocusCandidate(list, "a")).toEqual({ id: "b" });
  });

  it("picks the item right before the removed one when it was last", () => {
    expect(nextFocusCandidate(list, "c")).toEqual({ id: "b" });
  });

  it("returns null when the list only had that one item", () => {
    expect(nextFocusCandidate([{ id: "a" }], "a")).toBeNull();
  });

  it("returns null when the removed id is not in the list", () => {
    expect(nextFocusCandidate(list, "missing")).toBeNull();
  });
});

describe("DOM focus helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  it("focusCardLink focuses the link carrying that card's data-card-id", () => {
    document.body.innerHTML = `
      <a data-card-id="card-1" href="/jobs/one">One</a>
      <a data-card-id="card-2" href="/jobs/two">Two</a>
    `;
    focusCardLink("card-2");
    expect((document.activeElement as HTMLElement).getAttribute("href")).toBe("/jobs/two");
  });

  it("focusCardLink does nothing when no link matches", () => {
    document.body.innerHTML = `<a data-card-id="card-1" href="/jobs/one">One</a>`;
    focusCardLink("missing");
    expect(document.activeElement).toBe(document.body);
  });

  it("focusCardButton focuses the button carrying that card's data-card-id, not a link with the same id", () => {
    document.body.innerHTML = `
      <a data-card-id="card-1" href="/jobs/one">One</a>
      <button data-card-id="card-1">Move to</button>
    `;
    focusCardButton("card-1");
    expect((document.activeElement as HTMLElement).tagName).toBe("BUTTON");
  });

  it("focusColumnRegion focuses the empty-rail region for that column's fixed title", () => {
    document.body.innerHTML = `
      <section aria-label="Recruiter, no jobs" tabindex="-1">Recruiter</section>
      <section aria-label="Applied, no jobs" tabindex="-1">Applied</section>
    `;
    focusColumnRegion("recruiter_screen");
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("Recruiter, no jobs");
  });

  it("focusClosedViewToggle focuses the mode-tabs item labeled Closed, not Active", () => {
    document.body.innerHTML = `
      <button data-slot="mode-tabs-item">Active</button>
      <button data-slot="mode-tabs-item">Closed</button>
    `;
    focusClosedViewToggle();
    expect((document.activeElement as HTMLElement).textContent).toBe("Closed");
  });
});
