// Structural hast shapes, not `@types/hast`'s own types: hast is only a
// transitive dependency of react-markdown/rehype-sanitize, never installed
// directly by this app, and importing its types from a package this repo
// does not depend on directly would break the moment that transitive
// dependency's own version shifts underneath it. This shape is exactly what
// the plugin below reads and writes: an element's tag name and its children.
type HastNode = { type: string; tagName?: string; children?: HastNode[] };

/**
 * Re-levels every heading in a rendered markdown tree so the lowest heading
 * level actually present in the document becomes `options.base`, and every
 * other level used keeps its relative order above that floor. A document
 * pushed from outside the app always starts its own numbering at h1, which
 * would otherwise collide with the page's real h1 or produce a heading
 * lower in the outline than the surrounding page structure; this plugin is
 * what lets the same artifact body render at h2 inside one context and h3
 * or h4 inside another (the Documents editor's preview versus a Research
 * article), through nothing but the `headingBase` prop on `<Markdown>`.
 *
 * Ranking is by the distinct set of levels actually used, sorted ascending,
 * not by the raw h1-h6 number: a document that only ever uses h1 and h3
 * (skipping h2) re-levels to base and base+1, keeping the two exactly one
 * level apart rather than reproducing the two-level gap the source
 * document's author never intended as meaningful.
 */
export function rankHeadings(options: { base: number }) {
  return (tree: HastNode) => {
    const levels = new Set<number>();
    const visit = (node: HastNode, fn: (n: HastNode) => void) => {
      fn(node);
      node.children?.forEach((child) => visit(child, fn));
    };
    visit(tree, (n) => {
      const m = n.type === "element" && n.tagName ? /^h([1-6])$/.exec(n.tagName) : null;
      if (m) levels.add(Number(m[1]));
    });
    const ranks = [...levels].sort((a, b) => a - b);
    visit(tree, (n) => {
      const m = n.type === "element" && n.tagName ? /^h([1-6])$/.exec(n.tagName) : null;
      if (m) n.tagName = `h${Math.min(options.base + ranks.indexOf(Number(m[1])), 6)}`;
    });
  };
}
