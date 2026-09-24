import { describe, expect, it } from "vitest";
import { rankHeadings } from "@/lib/markdown/rank-headings";

type HastNode = { type: string; tagName?: string; children?: HastNode[] };

function heading(tagName: string, children: HastNode[] = []): HastNode {
  return { type: "element", tagName, children };
}

function root(children: HastNode[]): HastNode {
  return { type: "root", children };
}

function tagsOf(tree: HastNode): string[] {
  const tags: string[] = [];
  const visit = (node: HastNode) => {
    if (node.type === "element" && node.tagName) tags.push(node.tagName);
    node.children?.forEach(visit);
  };
  visit(tree);
  return tags;
}

describe("rankHeadings", () => {
  it("maps a single heading level straight to headingBase", () => {
    const tree = root([heading("h1"), { type: "text" } as HastNode, heading("h1")]);
    rankHeadings({ base: 3 })(tree);
    expect(tagsOf(tree)).toEqual(["h3", "h3"]);
  });

  it("ranks by the distinct levels actually used, in ascending order, not by the raw level number", () => {
    // Levels 1, 2 and 4 appear (never 3): the distinct set sorted is
    // [1, 2, 4], so rank 0 -> base, rank 1 -> base+1, rank 2 -> base+2,
    // regardless of the gap between 2 and 4.
    const tree = root([heading("h4"), heading("h1"), heading("h2"), heading("h1")]);
    rankHeadings({ base: 2 })(tree);
    expect(tagsOf(tree)).toEqual(["h4", "h2", "h3", "h2"]);
  });

  it("caps the result at h6 when headingBase plus the rank would exceed it", () => {
    // Four distinct levels (1,2,3,4) with base 4: ranks 0,1,2,3 map to
    // h4, h5, h6, h6 - the fourth is clamped, not h7.
    const tree = root([heading("h1"), heading("h2"), heading("h3"), heading("h4")]);
    rankHeadings({ base: 4 })(tree);
    expect(tagsOf(tree)).toEqual(["h4", "h5", "h6", "h6"]);
  });

  it("leaves a tree with no headings completely untouched, and does not throw", () => {
    const tree = root([{ type: "element", tagName: "p", children: [{ type: "text" } as HastNode] }]);
    expect(() => rankHeadings({ base: 3 })(tree)).not.toThrow();
    // tagsOf collects every element's tagName, headings or not - "p" surviving
    // unchanged is the actual assertion (no heading means nothing to rank),
    // not merely that the array came back empty.
    expect(tagsOf(tree)).toEqual(["p"]);
  });

  it("re-tags a heading nested inside another element, not only top-level children", () => {
    const tree = root([
      { type: "element", tagName: "blockquote", children: [heading("h2")] },
      heading("h1"),
    ]);
    rankHeadings({ base: 3 })(tree);
    expect(tagsOf(tree)).toEqual(["blockquote", "h4", "h3"]);
  });

  it("ignores a non-element node whose shape happens to lack a tagName", () => {
    const tree = root([{ type: "text" } as HastNode, heading("h1")]);
    expect(() => rankHeadings({ base: 2 })(tree)).not.toThrow();
    expect(tagsOf(tree)).toEqual(["h2"]);
  });
});
