// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { LibraryList } from "@/components/library/library-list";
import { LibraryFilters } from "@/components/library/library-filters";
import { LIBRARY_COPY } from "@/lib/library/copy";
import { parseLibraryQuery } from "@/lib/library/query";
import type { LibraryListRow } from "@/lib/library/items";

afterEach(cleanup);

function row(over: Partial<LibraryListRow> = {}): LibraryListRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "answer",
    title: "Tell me about yourself",
    bodyMd: "I design ordering tools.",
    firstLine: "I design ordering tools.",
    tags: ["intro", "pricing"],
    questionKey: "0123456789abcdef",
    sourceOpportunityId: null,
    sourceArtifactId: null,
    archivedAt: null,
    updatedAt: new Date("2026-11-01T10:00:00Z"),
    ...over,
  };
}

describe("LibraryList", () => {
  it("shows kind chip, tags, title, first line and 'Used in 3 jobs' per row", () => {
    render(<LibraryList rows={[row()]} used={new Map([["0123456789abcdef", 3]])} filtered={false} />);
    const item = screen.getAllByRole("listitem")[0];
    expect(within(item).getByText("Answer")).toBeTruthy();
    expect(within(item).getByText("intro")).toBeTruthy();
    expect(within(item).getByText("pricing")).toBeTruthy();
    expect(within(item).getByRole("link", { name: "Tell me about yourself" }).getAttribute("href")).toBe(
      "/library/11111111-1111-4111-8111-111111111111",
    );
    expect(within(item).getByText("I design ordering tools.")).toBeTruthy();
    expect(within(item).getByText("Used in 3 jobs")).toBeTruthy();
  });

  it("says 'Used in 1 job' for one and shows no count for an item with no question key", () => {
    render(
      <LibraryList
        rows={[row({ id: "a" }), row({ id: "b", kind: "story", title: "A story", questionKey: null })]}
        used={new Map([["0123456789abcdef", 1]])}
        filtered={false}
      />,
    );
    expect(screen.getByText("Used in 1 job")).toBeTruthy();
    expect(screen.getAllByText(/^Used in/)).toHaveLength(1);
  });

  it("the empty state shows the library copy", () => {
    render(<LibraryList rows={[]} used={new Map()} filtered={false} />);
    expect(screen.getByText(LIBRARY_COPY.empty)).toBeTruthy();
    expect(screen.getByText("Your library is empty. Save an answer from a question, or add a story, an intro or a fact.")).toBeTruthy();
    cleanup();
    render(<LibraryList rows={[]} used={new Map()} filtered />);
    expect(screen.getByText(LIBRARY_COPY.noMatches)).toBeTruthy();
    expect(screen.queryByText(LIBRARY_COPY.empty)).toBeNull();
  });

  it("marks an archived row with the Archived chip", () => {
    render(<LibraryList rows={[row({ archivedAt: new Date("2026-11-02T10:00:00Z") })]} used={new Map()} filtered={false} />);
    expect(screen.getByText("Archived")).toBeTruthy();
  });
});

describe("LibraryFilters", () => {
  it("filters submit as query parameters q, kind and tag", () => {
    const { container } = render(<LibraryFilters q="pricing" kind="story" tag="research" includeArchived={false} />);
    const form = container.querySelector("form") as HTMLFormElement;
    expect(form.method).toBe("get");
    expect(form.getAttribute("action")).toBe("/library");
    expect((screen.getByLabelText("Search") as HTMLInputElement).name).toBe("q");
    expect((screen.getByLabelText("Search") as HTMLInputElement).value).toBe("pricing");
    const kind = screen.getByLabelText("Kind") as HTMLSelectElement;
    expect(kind.name).toBe("kind");
    expect(kind.value).toBe("story");
    expect(Array.from(kind.options).map((o) => o.value)).toEqual(["", "answer", "story", "intro", "fact"]);
    const tag = screen.getByLabelText("Tag") as HTMLInputElement;
    expect(tag.name).toBe("tag");
    expect(tag.value).toBe("research");
    expect(screen.getByRole("button", { name: "Filter" })).toBeTruthy();
  });

  it("archived items are hidden by default: the box is unchecked and the query leaves them out", () => {
    render(<LibraryFilters includeArchived={false} />);
    const box = screen.getByLabelText("Show archived") as HTMLInputElement;
    expect(box.name).toBe("archived");
    expect(box.checked).toBe(false);
    expect(parseLibraryQuery({})).toEqual({ q: undefined, kind: undefined, tag: undefined, includeArchived: false });
    expect(parseLibraryQuery({ archived: "1", kind: "fact", q: " x ", tag: "t" })).toEqual({ q: "x", kind: "fact", tag: "t", includeArchived: true });
    expect(parseLibraryQuery({ kind: "bogus", q: ["a", "b"] }).kind).toBeUndefined();
    expect(parseLibraryQuery({ q: ["a", "b"] }).q).toBeUndefined();
  });

  it("shows a Clear link only when something is filtered", () => {
    render(<LibraryFilters includeArchived={false} />);
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    cleanup();
    render(<LibraryFilters q="x" includeArchived={false} />);
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/library");
  });
});
