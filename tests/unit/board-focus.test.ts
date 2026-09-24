// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import {
  focusCardLink,
  focusCardButton,
  focusColumnCardOrRegion,
  focusGroupCardOrFallback,
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

  it("focusColumnCardOrRegion focuses a remaining card link inside the column when one exists", () => {
    document.body.innerHTML = `
      <div data-column-kind="recruiter_screen" tabindex="-1">
        <a data-card-id="card-9" href="/jobs/nine">Nine</a>
      </div>
      <div data-column-kind="applied" tabindex="-1"></div>
    `;
    expect(focusColumnCardOrRegion("recruiter_screen")).toBe(true);
    expect((document.activeElement as HTMLElement).getAttribute("data-card-id")).toBe("card-9");
  });

  it("focusColumnCardOrRegion falls back to the column container itself when it has no cards", () => {
    document.body.innerHTML = `<div data-column-kind="recruiter_screen" tabindex="-1"></div>`;
    expect(focusColumnCardOrRegion("recruiter_screen")).toBe(true);
    expect((document.activeElement as HTMLElement).getAttribute("data-column-kind")).toBe("recruiter_screen");
  });

  // Board.tsx's own runClose relies on this: when the closed card was the
  // last one anywhere on the board, its whole column tree (this container
  // included) is swapped out for the empty-board state, and the caller
  // needs to know to fall back further, to its own "Add job" button.
  it("focusColumnCardOrRegion returns false and does nothing when the column itself is not in the DOM", () => {
    document.body.innerHTML = "";
    expect(focusColumnCardOrRegion("recruiter_screen")).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it("focusGroupCardOrFallback focuses a remaining card button inside the group when one exists", () => {
    document.body.innerHTML = `
      <section data-group-kind="recruiter_screen">
        <button data-card-id="card-9">Move to</button>
      </section>
    `;
    const fallback = document.createElement("button");
    document.body.appendChild(fallback);
    focusGroupCardOrFallback("recruiter_screen", fallback);
    expect((document.activeElement as HTMLElement).getAttribute("data-card-id")).toBe("card-9");
  });

  it("focusGroupCardOrFallback uses the given fallback when the group has vanished entirely", () => {
    document.body.innerHTML = "";
    const fallback = document.createElement("button");
    fallback.textContent = "Add job";
    document.body.appendChild(fallback);
    focusGroupCardOrFallback("recruiter_screen", fallback);
    expect(document.activeElement).toBe(fallback);
  });

  it("focusGroupCardOrFallback does nothing when the group is gone and there is no fallback either", () => {
    document.body.innerHTML = "";
    focusGroupCardOrFallback("recruiter_screen", null);
    expect(document.activeElement).toBe(document.body);
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
