// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InlineView, SplitView } from "@/components/compare/marks";
import { COPY } from "@/components/compare/compare-copy";
import type { ViewRow } from "@/lib/compare/collapse";

const words: ViewRow = {
  type: "change",
  id: 1,
  removed: ["the old plan\n"],
  added: ["the new plan\n"],
  words: {
    left: [
      { text: "the ", kind: "same" },
      { text: "old", kind: "removed" },
      { text: " plan\n", kind: "same" },
    ],
    right: [
      { text: "the ", kind: "same" },
      { text: "new", kind: "added" },
      { text: " plan\n", kind: "same" },
    ],
  },
  wordsSkipped: false,
};
const noop = () => {};

describe("compare views", () => {
  it("SplitView: del on the left, ins on the right, one scroll container", () => {
    const { container } = render(<SplitView rows={[words]} onExpand={noop} />);
    const row = container.querySelector("[data-change]")!;
    const cols = row.children;
    expect(cols[0].querySelector("del")?.textContent).toBe("removed old");
    expect(cols[0].querySelector("del")?.className).toContain("bg-status-action-soft");
    expect(cols[1].querySelector("ins")?.textContent).toBe("added new");
    expect(cols[1].querySelector("ins")?.className).toContain("bg-status-approved-soft");
    expect(container.querySelectorAll(".overflow-x-auto")).toHaveLength(1);
  });

  it("InlineView: removed before added, same marks", () => {
    const { container } = render(<InlineView rows={[words]} onExpand={noop} />);
    const del = container.querySelector("del")!;
    const ins = container.querySelector("ins")!;
    expect(del.compareDocumentPosition(ins) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("each run starts with visually hidden text", () => {
    const { container } = render(<InlineView rows={[words]} onExpand={noop} />);
    expect(container.querySelector("del > .sr-only")?.textContent).toBe("removed ");
    expect(container.querySelector("ins > .sr-only")?.textContent).toBe("added ");
  });

  it("renders document markup as text only", () => {
    const rows: ViewRow[] = [
      { type: "same", units: ["<script>alert(1)</script>\n", "<b>x</b>\n"] },
    ];
    for (const View of [SplitView, InlineView]) {
      const { container, unmount } = render(<View rows={rows} onExpand={noop} />);
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("b")).toBeNull();
      expect(container.textContent).toContain("<script>alert(1)</script>");
      unmount();
    }
  });

  it("keeps line breaks and breaks long strings", () => {
    const { container } = render(
      <InlineView rows={[{ type: "same", units: ["a\n", "b\n"] }]} onExpand={noop} />,
    );
    const block = container.querySelector("[data-view] > div")!;
    expect(block.className).toContain("whitespace-pre-wrap");
    expect(block.className).toContain("break-words");
  });

  it("wordsSkipped shows whole text and the notice", () => {
    const skipped: ViewRow = {
      type: "change",
      id: 2,
      removed: ["gone\n"],
      added: ["new\n"],
      words: null,
      wordsSkipped: true,
    };
    for (const View of [SplitView, InlineView]) {
      const { container, unmount } = render(<View rows={[skipped]} onExpand={noop} />);
      expect(container.querySelector("del")?.textContent).toBe("removed gone\n");
      expect(container.querySelector("ins")?.textContent).toBe("added new\n");
      expect(container.textContent).toContain(COPY.tooManyToMark);
      unmount();
    }
  });

  it("every change carries data-change and a per-view id; fold button expands", () => {
    const onExpand = vi.fn();
    const rows: ViewRow[] = [words, { type: "folded", hidden: Array(14).fill("x\n"), count: 14, key: "fold-1" }];
    const split = render(<SplitView rows={rows} onExpand={onExpand} />);
    expect(split.container.querySelector("#change-1-split")?.getAttribute("data-change")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Show 14 unchanged lines" }));
    expect(onExpand).toHaveBeenCalledWith("fold-1");
    split.unmount();
    const inline = render(<InlineView rows={rows} onExpand={onExpand} />);
    expect(inline.container.querySelector("#change-1-inline")?.getAttribute("data-change")).toBe("1");
  });
});
