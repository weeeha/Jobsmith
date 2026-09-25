# Milestone 3 (Bridge): Tasks 10 to 15

Part of the Milestone 3 plan. Read `README.md` first: it holds the goal, the global constraints
and the Contract (called "the frame" in the task text below) that these tasks follow. These six
tasks build the user interface on top of Tasks 1 to 9's data, lib, tokens and bridge layers: the
sanitized Markdown renderer and copy button every later task reuses, Settings with API tokens, the
paste dialog with Research and Prep, the Documents tab with its editor and version history, the
end-to-end and accessibility suite that proves the whole milestone works together, and the docs
that ship it.

Every accessible name, announcement, toast and validation message below is copied character for
character from `README.md`'s "UI copy and accessible names" and "Messages and validation" sections.
Every signature is copied character for character from `README.md`'s Contract and from `tasks-01-04.md`'s
"Interfaces" blocks for Tasks 1 to 4. A Sonnet builder implementing one of these tasks sees only
that task's own text, so each one restates the props, copy and risks it needs rather than pointing
back at an earlier task's prose.

---

### Task 10: UI foundations: sanitized Markdown, the copy button, the server action body limit

Every later task in this part depends on this one: `components/markdown.tsx` is how Research,
Documents and Prep render a document's body, and how the Documents editor renders its own preview;
`components/copy-button.tsx` is how the Settings token reveal and the Prep bridge panel let a user
copy a value without a mouse-drag selection; the `next.config.ts` change is what lets the paste
dialog and the editor submit a document close to the 1 MiB artifact limit without Next's default
1 MB server action body cap rejecting it first.

**Files:**
- Create: `components/markdown.tsx`, `lib/markdown/rank-headings.ts`, `components/copy-button.tsx`, `tests/unit/markdown.test.tsx`, `tests/unit/rank-headings.test.ts`, `tests/unit/copy-button.test.tsx`
- Modify: `next.config.ts`, `package.json`

**Interfaces:**
- Consumes: nothing from Tasks 1 to 9. This task is self-contained foundational UI work: `Markdown` and `CopyButton` take only plain props (a string body, a heading base, a value and a label), never a database row, a `Scoped`, or an artifact-specific type. `CopyButton` consumes `useAnnounce` from `@/components/live-announcer` (Milestone 2, unmodified) and `toast` from `"sonner"` (Milestone 2, mounted once in `app/(app)/layout.tsx`, unmodified). Everything a later task needs from here comes from this task's own "Produces" list.
- Produces (copied from the frame character for character):

```typescript
// components/markdown.tsx
export function Markdown(props: { source: string; headingBase: 2 | 3 | 4 }): React.ReactElement;
// components/copy-button.tsx
export function CopyButton(props: { value: string; label: string }): React.ReactElement;
// lib/markdown/rank-headings.ts
export function rankHeadings(options: { base: number }): (tree: HastNode) => void;
```

`rankHeadings` is not itself named in the frame's Contract (it is the frame's own internal
implementation note for `Markdown`'s rehype pipeline: "`rankHeadings` in `lib/markdown/rank-headings.ts`,
structural hast types, checked in a planning scratch file"), but a later task never imports
it directly: everything after this task reaches heading re-leveling only through `<Markdown
headingBase={...}>`. It is listed here because it is its own file with its own unit test.

**The risk this task exists to close.** Every artifact body that reaches this renderer came from
outside the app: a CLI push, a paste, or (from Milestone 4) an AI extraction. None of it can be
trusted as HTML. D21 fixes the exact defense: GFM tables render, raw HTML is dropped entirely
(`skipHtml: true`, not merely escaped to visible text), only `http:`, `https:` and `mailto:` links
become clickable, images never load (never even request a URL - a pushed document could otherwise
be used to beacon out to a tracking pixel the moment someone opens the tab), and headings are
re-leveled so a document's own `# Title` never collides with the page's real `<h1>` or produces a
heading level lower than the page's actual outline. This task's three test files exist to make each
of those five behaviors fail loudly if a future change weakens the pipeline (a components-map key
renamed, a plugin dropped, an order swapped) rather than silently shipping unsanitized output.

Verified in a planning scratch file (not kept in the
repo): the EXACT components map this task ships below - the link-protocol allowlist, the
image-as-text override, the task-checkbox `aria-label`, the table and `pre` wrappers, and
`rankHeadings` re-tagging through a real `headingBase` value - run against react-markdown 10.1.0,
remark-gfm 4.0.1 and rehype-sanitize 6.0.0, borrowed read-only from two sibling local projects the
same way an earlier planning scratch file did (nothing is installed by that
check; `pnpm add` in Step 1 below is what actually installs the three packages into this repo).
Eight checks passed: headings re-tag by rank through `headingBase`; a table sits inside the exact
`tabIndex={0} className="overflow-x-auto rounded-md border border-border"` wrapper; a fenced code
block's `pre` itself carries `tabIndex={0}` and stays overflow-scrollable; `http:`, `https:` and
`mailto:` links render as real anchors while `javascript:`, `data:`, a relative path and a bare
fragment all render as their own plain text with no `<a>` at all; an image never becomes an `<img>`
and instead renders the literal text `Image: <alt>`; a checked task-list item gets `aria-label="Done"`
and an unchecked one gets `aria-label="Not done"`, both staying `disabled`; and, as a control matching
the earlier check, a raw `<script>` is still dropped and GFM strikethrough/autolinks still
render through this task's full components map, not just smaller proof-of-concept
one. `components/copy-button.tsx`'s exact code below was separately verified in
a planning scratch file, run under this repo's own Vitest against the real,
already-installed `@/components/ui/button` and `@/components/live-announcer` (nothing borrowed for
this one: React, Testing Library and jsdom are already dependencies of this repo). Three checks
passed: the button's visible text is `Copy` while its accessible name comes from the `label` prop;
a successful `navigator.clipboard.writeText` announces `Copied.` through the live region; a
rejected one calls `toast.error` with the fixed sentence below and never announces anything.

- [ ] **Step 1: Install the three markdown packages**

```bash
pnpm add react-markdown@10.1.0 remark-gfm@4.0.1 rehype-sanitize@6.0.0
```

Expected: `package.json`'s `dependencies` gains exactly these three entries (alphabetical among the
existing list), and `pnpm-lock.yaml` updates. No other dependency version changes: these three have
no overlapping peer requirement with anything already installed (React 19, which react-markdown 10
targets, is already the app's own React version).

- [ ] **Step 2: Write the failing `rank-headings` tests**

Create `tests/unit/rank-headings.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/rank-headings.test.ts
```

Expected: fails with `Cannot find module '@/lib/markdown/rank-headings'`.

- [ ] **Step 4: Write `lib/markdown/rank-headings.ts` in full**

Copied verbatim from a verified planning scratch file, as the frame
requires ("structural hast types, checked in a planning scratch file"), with only the
plugin function itself kept (the scratch file's own `Markdown`-rendering lines below it were there to
exercise the plugin inside `react-markdown`'s `Options` type for typecheck, not
part of what this task ships as a file):

```typescript
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
```

- [ ] **Step 5: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/rank-headings.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 6: Write the failing `Markdown` tests**

Create `tests/unit/markdown.test.tsx`. This renders with `renderToStaticMarkup` rather than Testing
Library/jsdom, matching the frame's own instruction for this file: `Markdown` is a plain function
returning a React element with no client-side state, so its whole contract is the HTML string it
produces for a given `source` and `headingBase`.

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/markdown";

function html(source: string, headingBase: 2 | 3 | 4 = 2): string {
  return renderToStaticMarkup(<Markdown source={source} headingBase={headingBase} />);
}

describe("Markdown", () => {
  it("wraps the rendered body in a break-words text-sm text-foreground container", () => {
    expect(html("Body text.")).toMatch(/^<div class="break-words text-sm text-foreground">/);
  });

  it("re-tags headings starting at headingBase, ranking the distinct levels used", () => {
    const out = html("# Title\n\n### Sub", 3);
    expect(out).toMatch(/<h3[^>]*>Title<\/h3>/);
    expect(out).toMatch(/<h4[^>]*>Sub<\/h4>/);
  });

  it("wraps a GFM table in a tabIndex=0 overflow-x-auto bordered container", () => {
    const out = html(["| A | B |", "|---|---|", "| 1 | 2 |"].join("\n"));
    expect(out).toMatch(/<div tabindex="0" class="overflow-x-auto rounded-md border border-border"><table/);
    expect(out).toMatch(/<td>1<\/td>/);
  });

  it("gives a fenced code block's own pre element tabIndex=0 and overflow-x-auto", () => {
    const out = html(["```", "code line", "```"].join("\n"));
    expect(out).toMatch(/<pre tabindex="0" class="[^"]*overflow-x-auto[^"]*">/);
  });

  it.each([
    ["http://example.com/a", true],
    ["https://example.com/a", true],
    ["mailto:a@example.com", true],
    ["javascript:alert(1)", false],
    ["data:text/html;base64,PHNjcmlwdD4=", false],
    ["./relative-notes.md", false],
    ["#fragment", false],
  ])("link %s becomes a real anchor: %s", (href, shouldLink) => {
    const out = html(`[text](${href})`);
    if (shouldLink) {
      expect(out).toContain(`href="${href}"`);
      expect(out).toMatch(/<a[^>]*>text<\/a>/);
    } else {
      expect(out).not.toContain("<a ");
      expect(out).not.toContain("<a>");
      expect(out).toContain(">text<");
    }
  });

  it("never loads an image: renders the literal text Image: <alt> instead of an <img> tag", () => {
    const out = html("![a screenshot of the offer letter](https://tracker.example/p.png)");
    expect(out).not.toContain("<img");
    expect(out).toContain("Image: a screenshot of the offer letter");
  });

  it("marks a checked task-list item Done and an unchecked one Not done, both disabled", () => {
    const out = html("- [x] done task\n- [ ] open task");
    const doneItem = /<li class="task-list-item"><input([^>]*)\/> done task<\/li>/.exec(out)?.[1] ?? "";
    const openItem = /<li class="task-list-item"><input([^>]*)\/> open task<\/li>/.exec(out)?.[1] ?? "";
    expect(doneItem).toContain('checked=""');
    expect(doneItem).toContain('aria-label="Done"');
    expect(doneItem).toContain('disabled=""');
    expect(openItem).not.toContain('checked=""');
    expect(openItem).toContain('aria-label="Not done"');
    expect(openItem).toContain('disabled=""');
  });

  it("drops raw HTML entirely rather than showing it as escaped text", () => {
    const out = html('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\nInline <b>bold</b> and <!-- hidden --> text.');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert\(1\)/);
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/<b>/);
    expect(out).not.toMatch(/hidden/);
    expect(out).not.toMatch(/&lt;script&gt;/); // not even escaped-to-text
  });

  it("still renders GFM strikethrough and autolinks through the full sanitize pipeline", () => {
    const out = html("~~struck~~ and www.example.org autolink");
    expect(out).toMatch(/<del>struck<\/del>/);
    expect(out).toMatch(/href="http:\/\/www.example.org"/);
  });

  it("accepts every headingBase the type allows", () => {
    expect(html("# X", 2)).toMatch(/<h2[^>]*>X<\/h2>/);
    expect(html("# X", 3)).toMatch(/<h3[^>]*>X<\/h3>/);
    expect(html("# X", 4)).toMatch(/<h4[^>]*>X<\/h4>/);
  });
});
```

- [ ] **Step 7: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/markdown.test.tsx
```

Expected: fails with `Cannot find module '@/components/markdown'`.

- [ ] **Step 8: Write `components/markdown.tsx` in full**

No `"use client"` directive: react-markdown 10's `Markdown` component holds no hooks and needs no
browser API to render, so it works unmodified inside a Server Component (this is exactly the
"Unverified" item the frame's own list of unverified items names - "react-markdown 10 has no hooks in
`Markdown` and no client directive, so a Server Component can render it" - unverified only in the
sense that it has not been built inside a real Next 16 app yet; the planning scratch file above confirms
the render itself needs nothing client-only). Because it carries no directive, the same file also
renders correctly inside a client component (the Documents editor's live preview, Task 13), so one
file serves both.

```tsx
import ReactMarkdown from "react-markdown";
import type { Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

import { rankHeadings } from "@/lib/markdown/rank-headings";

// Only these three schemes ever become a clickable link. A relative
// path or a bare fragment has nothing to resolve against once a document's
// origin (a CLI push, a paste, an AI extraction) is stripped from it, and
// every other scheme (javascript:, data:, tel:, an unknown custom scheme) is
// either an active-content risk or simply not something this app can act
// on - rehype-sanitize and react-markdown's own default urlTransform already
// strip the two dangerous ones from `href`, but this still renders the
// rejected link as its own text rather than a dead or stripped-looking
// anchor, so a document that references a link some other tool can follow
// (a local file path in a pushed packet, for example) never looks broken.
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function allowedProtocol(href: string): boolean {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(href);
  return match !== null && ALLOWED_LINK_PROTOCOLS.has(`${match[1]!.toLowerCase()}:`);
}

const HEADING_CLASS = "mt-4 mb-2 font-semibold text-foreground first:mt-0";

function heading(Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
  return function HeadingComponent({ node: _node, ...props }: React.ComponentPropsWithoutRef<"h1"> & { node?: unknown }) {
    return <Tag className={HEADING_CLASS} {...props} />;
  };
}

const components: Options["components"] = {
  h1: heading("h1"),
  h2: heading("h2"),
  h3: heading("h3"),
  h4: heading("h4"),
  h5: heading("h5"),
  h6: heading("h6"),
  // tabIndex={0}: a table wider than its container needs a keyboard-focusable
  // scroll region, or a keyboard user has no way to reach the columns a
  // mouse user can scroll to (the same reasoning as the paste dialog's and
  // job page's every other overflow container).
  table: ({ node: _node, ...props }) => (
    <div tabIndex={0} className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      tabIndex={0}
      className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-sm"
      {...props}
    />
  ),
  a: ({ node: _node, href, children }) =>
    href && allowedProtocol(href) ? (
      <a href={href} target="_blank" rel="noreferrer" className="underline">
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
  // Images never load, full stop: a pushed or pasted document could
  // otherwise reference a remote URL that fires the instant the document is
  // viewed, with no user action in between (a tracking pixel). The alt text
  // is the one part of an image worth keeping, so it survives as plain text.
  img: ({ node: _node, alt }) => <span>{`Image: ${alt ?? ""}`}</span>,
  input: ({ node: _node, type, checked, ...props }) =>
    type === "checkbox" ? (
      <input
        type="checkbox"
        checked={checked ?? false}
        disabled
        aria-label={checked ? "Done" : "Not done"}
        {...props}
      />
    ) : (
      <input type={type} checked={checked} {...props} />
    ),
};

export function Markdown({ source, headingBase }: { source: string; headingBase: 2 | 3 | 4 }): React.ReactElement {
  return (
    <div className="break-words text-sm text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, [rankHeadings, { base: headingBase }]]}
        skipHtml
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
```

`rehypeSanitize` runs before `rankHeadings` in the array, in that order deliberately: sanitizing
first means only headings the sanitizer already allowed (plain `h1` through `h6`, never something
an attacker smuggled in) ever reach the re-leveling step, and re-leveling after sanitizing means the
sanitizer never has to know about this app's own `headingBase` convention. `Options["components"]`
(imported as a type only) is what types the `components` map against react-markdown's own declared
shape rather than this file guessing each element's prop interface by hand, the same delegation the
planning scratch file for `rank-headings.ts` already relied on for the plugin's `Options` typing.

Unverified beyond the planning scratch file above: the exact TypeScript shape react-markdown 10's own
`.d.ts` gives each `components` entry (the planning scratch file proves the runtime behavior in plain
JavaScript, not the types, because the sibling projects it borrows from were not set up to run this
file's own `.tsx` syntax through `tsc`). If `pnpm typecheck` in Step 12 below reports a mismatch on
one of the destructured props (`node`, `checked`, `alt`), the fix is narrowing that one component's
parameter type to match what `Options["components"]`'s indexed member actually says, not loosening
the map to `any`.

- [ ] **Step 9: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/markdown.test.tsx
```

Expected: `Test Files 1 passed (1)`, `Tests 16 passed (16)` (9 fixed cases + 7 `it.each` link-protocol
cases).

- [ ] **Step 10: Write the failing `CopyButton` tests**

Create `tests/unit/copy-button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Toaster, toast } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { CopyButton } from "@/components/copy-button";

function renderButton(value: string, label: string) {
  return render(
    <LiveAnnouncerProvider>
      <Toaster />
      <CopyButton value={value} label={label} />
    </LiveAnnouncerProvider>,
  );
}

describe("CopyButton", () => {
  it("shows the visible text Copy while taking its accessible name from label", () => {
    renderButton("jsm_abc", "Copy the token");
    const button = screen.getByRole("button", { name: "Copy the token" });
    expect(button.textContent).toBe("Copy");
  });

  it("writes the value to the clipboard and announces Copied. on success", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderButton("jsm_abc", "Copy the token");
    await act(async () => {
      screen.getByRole("button", { name: "Copy the token" }).click();
      await Promise.resolve();
      vi.advanceTimersByTime(50);
    });

    expect(writeText).toHaveBeenCalledWith("jsm_abc");
    expect(screen.getByRole("status").textContent).toBe("Copied.");
    vi.useRealTimers();
  });

  it("toasts the fixed failure sentence and never announces when the clipboard rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const toastErrorSpy = vi.spyOn(toast, "error");
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderButton("jsm_abc", "Copy the pull command");
    await act(async () => {
      screen.getByRole("button", { name: "Copy the pull command" }).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastErrorSpy).toHaveBeenCalledWith("Could not copy. Select the text and copy it by hand.");
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
```

- [ ] **Step 11: Run it, confirm it fails, implement `components/copy-button.tsx`, confirm it passes**

```bash
pnpm exec vitest run tests/unit/copy-button.test.tsx
```

Expected: fails with `Cannot find module '@/components/copy-button'`.

```tsx
"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAnnounce } from "@/components/live-announcer";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const announce = useAnnounce();

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
      announce("Copied.");
    } catch (error) {
      // A clipboard write can be refused by the browser (no user gesture in
      // some embedded contexts, a denied permission) or simply unsupported;
      // either way nothing was copied, and the toast below is the one place
      // this frame gives the user a way forward by hand.
      console.error("copy failed", error);
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" aria-label={label} onClick={handleClick}>
      Copy
    </Button>
  );
}
```

```bash
pnpm exec vitest run tests/unit/copy-button.test.tsx
```

Expected: `Test Files 1 passed (1)`, `Tests 3 passed (3)`.

- [ ] **Step 12: Add the server action body limit to `next.config.ts`**

Read `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`
first (the repo's own `AGENTS.md` rule for any Next.js API): `bodySizeLimit` takes a byte count or a
string such as `"2mb"`, and sits under `experimental.serverActions`. The default of 1 MB would
reject the paste dialog's and the editor's own `bodyMd` field once a document approaches the 1 MiB
(`1_048_576` byte) `MAX_ARTIFACT_BYTES` ceiling, because the actual `multipart/form-data` request
carries extra bytes for boundaries and field names on top of the field's own content (the same docs
page: "leave some room for this overhead... an additional 10-20 KB is a reasonable rule of thumb").
2 MB is comfortably clear of a 1 MiB body plus that overhead, plus the request's other fields
(title, kind, stage id).

Edit `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The default 1 MB would reject a document near the 1 MiB artifact
      // limit (MAX_ARTIFACT_BYTES, lib/bridge/wire.ts) once multipart
      // form-data overhead is added on top of the field's own bytes.
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Blocks this app from being framed by any site at all, including
          // its own origin: there is no legitimate reason to embed it, and
          // this is the modern replacement for X-Frame-Options.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // Sends the full URL as a referrer only on same-origin navigation;
          // cross-origin navigation gets the origin alone, and downgrading
          // to a plain HTTP destination gets nothing.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Stops a browser from guessing a response's type from its
          // content and executing it as something other than what the
          // Content-Type header says.
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

Only the new `experimental.serverActions` block is added; the existing `headers()` function is
unchanged.

- [ ] **Step 13: Manual browser check**

This task ships no route of its own, so the check is a small scratch page rather than a real screen
(Task 12 is the first task that actually renders `<Markdown>` and `<CopyButton>` inside the app; this
step exists so a broken renderer is caught here, not three tasks later):

1. Temporarily add a throwaway route (for example `app/(app)/scratch/page.tsx`, deleted before
   committing) that renders `<Markdown source={"# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n[bad](javascript:alert(1)) [ok](https://example.com)\n\n![x](https://example.com/x.png)\n\n- [x] done\n- [ ] open"} headingBase={2} />` and a `<CopyButton value="hello" label="Copy hello" />` beside it.
2. `pnpm dev`, open the scratch route in Chrome. Confirm: the title renders as a real heading, the
   table renders with visible borders and scrolls horizontally when narrowed, `bad` renders as plain
   text with no link while `ok` is a clickable link, the image renders as literal `Image: x` text
   with no broken-image icon, both checkboxes render checked/unchecked and are not clickable. Click
   Copy; confirm a live region announcement fires (inspect the accessibility tree; there is no
   visible toast on success) and that pasting from the clipboard elsewhere yields `hello`.
3. Repeat in Safari. Check both light and dark (system appearance toggle).
4. Delete the scratch route.

- [ ] **Step 14: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
```

Expected: all four exit 0, with `pnpm test` reporting `tests/unit/rank-headings.test.ts` (6),
`tests/unit/markdown.test.tsx` (16) and `tests/unit/copy-button.test.tsx` (3) passing alongside
every existing test. `pnpm check:tokens` passes because every class in `components/markdown.tsx` and
`components/copy-button.tsx` is a semantic utility or a stock shadcn variable name (`border-border`,
`bg-muted`, `text-foreground`, spacing and typography scale utilities), never a raw color or an
arbitrary value.

- [ ] **Step 15: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.ts components/markdown.tsx components/copy-button.tsx lib/markdown/rank-headings.ts tests/unit/markdown.test.tsx tests/unit/rank-headings.test.ts tests/unit/copy-button.test.tsx
git commit -m "$(cat <<'EOF'
feat: add the sanitized Markdown renderer, copy button and 2 MB action limit
EOF
)"
```

---

### Task 11: Settings and API tokens

**Files:**
- Create: `app/(app)/settings/page.tsx`, `app/(app)/settings/actions.ts`, `components/settings/api-tokens-section.tsx`
- Modify: `components/app-shell.tsx`

**Interfaces:**
- Consumes: `requireUser` (`@/lib/auth/session`, Milestone 1). `scopedFor` (`@/lib/db/scoped`, Milestone 1/2). `createApiToken`, `listApiTokens`, `revokeApiToken`, `tokenNameSchema`, `TokenFormState` (`@/lib/auth/api-token.ts`, Task 5). `ApiTokenListItem` (`@/lib/db/scoped`, Task 2). `messageFor` (`@/lib/pipeline/messages.ts`, extended by Task 4 with `token_not_found`). `Result`, `fail` (`@/lib/result.ts`). `submitViaTransition` (`@/lib/forms/submit.ts`). `focusWasLost`, `correctFocusOnceLost` (`@/lib/dom/focus.ts`). `useAnnounce` (`@/components/live-announcer.tsx`). `LocalTime` (`@/components/local-time.tsx`). `FieldRow` (`@/components/super-ai/field-row.tsx`). `EmptyState` (`@/components/super-ai/empty-state.tsx`). `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` (`@/components/ui/dialog`). `Input`, `Button` (`@/components/ui`). `CopyButton` (`@/components/copy-button.tsx`, Task 10). `toast` from `"sonner"`.
- Produces (copied from the frame character for character):

```typescript
// app/(app)/settings/actions.ts
export async function createTokenAction(_prev: TokenFormState, formData: FormData): Promise<TokenFormState>;
export async function revokeTokenAction(tokenId: string): Promise<Result<null, string>>;
```

Route `GET /settings`. `components/app-shell.tsx`'s `NAV_ITEMS` gains a `Settings` entry after `Board`,
which is what actually puts the route in the sidebar and the phone bottom bar (D27, the owner's call:
Settings appears now; Milestone 5 adds Profile and Export sections to this same page).

**The three risks this task carries, restated from Milestone 2 and checked in Step 9's manual pass:**
(1) after a revoke, the row's own "Revoke" button is gone and focus must land on `[data-token-create]`,
never `<body>`; (2) the create dialog's two states (form, then reveal) live in one mounted
`DialogContent`, so nothing here can rely on Base UI's own open/close focus restoration to carry focus
between them; (3) a token's `prefix` is a fixed-width but still arbitrary string and needs `break-all`
or `break-words` wherever it renders next to other text, so a long value cannot force page-level
horizontal overflow at 390px.

- [ ] **Step 1: Add Settings to `components/app-shell.tsx`'s navigation**

This one array drives both the desktop sidebar and the phone bottom bar (the same file's `<nav
aria-label="Primary">` list at the bottom maps over the identical `NAV_ITEMS`), so one change reaches
both. Nothing else in this file changes.

```typescript
const NAV_ITEMS = [
  { id: "home", label: "Home", href: "/" },
  { id: "board", label: "Board", href: "/board" },
  { id: "settings", label: "Settings", href: "/settings" },
];
```

- [ ] **Step 2: Write `app/(app)/settings/actions.ts` in full**

No dedicated unit test file: both actions are thin wrappers over already-tested `lib/auth/api-token.ts`
functions (Task 5's own unit and integration tests cover `createApiToken`, `revokeApiToken` and
`tokenNameSchema` directly), the same reasoning Milestone 2's `createOpportunityAction` and every
plain stage-control action in `app/(app)/jobs/[slug]/actions.ts` used for going straight to a manual
check and end-to-end coverage instead of a redundant action-level test. Task 14's `bridge.spec.ts`
(D37) exercises both actions for real, through the browser, including the failure path on revoke.

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { createApiToken, revokeApiToken, tokenNameSchema, type TokenFormState } from "@/lib/auth/api-token";
import { messageFor } from "@/lib/pipeline/messages";
import { fail, type Result } from "@/lib/result";

export async function createTokenAction(_prev: TokenFormState, formData: FormData): Promise<TokenFormState> {
  const user = await requireUser();
  const parsed = tokenNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? messageFor("invalid");
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: { name: message } };
  }
  const s = scopedFor(user.id);
  const result = await createApiToken(s, parsed.data);
  if (!result.ok) {
    return { ok: false, code: result.code, message: messageFor(result.code) };
  }
  revalidatePath("/settings");
  return { ok: true, data: { token: result.data.token, name: result.data.item.name } };
}

export async function revokeTokenAction(tokenId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsedId = z.uuid().safeParse(tokenId);
  if (!parsedId.success) return fail("token_not_found", messageFor("token_not_found"));
  const s = scopedFor(user.id);
  const result = await revokeApiToken(s, tokenId);
  if (!result.ok) return fail(result.code, messageFor(result.code));
  revalidatePath("/settings");
  return { ok: true, data: null };
}
```

`tokenNameSchema` is a bare `z.ZodType<string>`, not an object schema, so its one issue's path is
empty and `fieldErrorsFromZod` (which reads `issue.path[0]`) does not apply here; the field error is
built by hand from the schema's own first (and only) issue message instead, while the top-level
`message` stays the same `messageFor("invalid")` ("Check the highlighted fields.") every other form
in this app shows at the top, matching `app/(app)/jobs/[slug]/actions.ts`'s own convention of a
generic top-level message plus a specific per-field `fieldErrors` entry. `revokeTokenAction` never
routes its failure through `messageFor` for display purposes on the client side - like every plain
`Result`-returning action in `app/(app)/jobs/[slug]/actions.ts`, the calling component converts
`result.code` to text with `messageFor` itself at the point it builds the toast, so the action's own
`.message` field only has to be a valid string, not the exact text a user will see.

- [ ] **Step 3: Write `app/(app)/settings/page.tsx` in full**

```tsx
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { listApiTokens } from "@/lib/auth/api-token";
import { ApiTokensSection } from "@/components/settings/api-tokens-section";

export default async function SettingsPage() {
  const user = await requireUser();
  const tokens = await listApiTokens(scopedFor(user.id));

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <ApiTokensSection tokens={tokens} />
    </div>
  );
}
```

`text-lg font-semibold` matches the page-level `<h1>` on `/` and `/board` (`app/(app)/page.tsx`,
`app/(app)/board/page.tsx`), since Settings is a sibling top-level page, not a job-specific header
(which uses the larger `text-xl` in `job-header.tsx`).

- [ ] **Step 4: Build `components/settings/api-tokens-section.tsx`**

Client component (`"use client"`; it holds the create/revoke dialog open state and calls
`useActionState`/`useTransition`, the same reasons every M2 dialog-holding component is a client
component).

```typescript
export function ApiTokensSection(props: { tokens: ApiTokenListItem[] }): React.ReactElement;
```

Structure:
- `<section>` (no `aria-label`: the frame's copy for Settings never names one, unlike Research,
  Documents and Prep, which each get an explicit section label - this section is identified purely
  by its own `<h2>`, the same way a single-section page needs no extra landmark yet; Milestone 5
  adding Profile and Export as siblings is what will make a real case for one, and that task can add
  it then without this one inventing a name the frame does not give).
- `<h2>API tokens</h2>`, then the intro paragraph `Tokens let the jobsmith command line read your
  jobs and push documents to them.`
- `Button` `Create token` (`data-token-create=""`, the plain marker attribute `RevokeTokenDialog`'s
  own success handler focuses by selector, the same idiom as `person-dialog.tsx`'s
  `ADD_PERSON_TRIGGER_SELECTOR`), `onClick` opens `CreateTokenDialog` (local `createOpen` state).
- The list: `tokens.length === 0` renders `<EmptyState size="panel" title="No tokens yet." />`;
  otherwise `<ul aria-label="API tokens">`, one `<li>` per token via a `TokenRow` sub-component.
- Renders one `CreateTokenDialog` as a sibling of the button, controlled by `createOpen`.

`TokenRow({ token }: { token: ApiTokenListItem })`, one per list item, holds its own `revokeOpen`
state:
- The name (`<span className="break-words font-medium text-foreground">{token.name}</span>`; a
  60-character name is short enough that overflow is unlikely, but `break-words` costs nothing and
  matches every other free-text field this milestone renders next to fixed-width siblings).
- The prefix in code: `<code className="break-all text-xs text-muted-foreground">{token.prefix}…</code>`
  (the frame's own copy is `` `<prefix>…` `` - the actual ellipsis character, not three periods;
  `break-all` because a token prefix is `jsm_` plus four more characters with no natural word break,
  the same "long unbroken strings... get `break-words` or `break-all`" rule as a token, key or slug
  anywhere else in this milestone).
- `Created <LocalTime value={token.createdAt} mode="date" />`.
- `token.lastUsedAt ? <>Last used <LocalTime value={token.lastUsedAt} mode="date" /></> : "Never used"`.
- `token.revokedAt ? <>Revoked <LocalTime value={token.revokedAt} mode="date" /></> : ` a `Button`
  `Revoke` (`aria-label`\`Revoke ${token.name}\`, `ref={revokeButtonRef}`) that opens
  `RevokeTokenDialog` (`revokeOpen` state).
- Renders one `RevokeTokenDialog` as a sibling, `open={revokeOpen}`, `onOpenChange={setRevokeOpen}`,
  `token={{ id: token.id, name: token.name }}`.

`CreateTokenDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void })`:
`Dialog`/`DialogContent` wrapping a `CreateTokenDialogBody` (a separate component inside
`DialogContent`, the same `AddJobForm`/`EditDetailsForm` reasoning every M2 dialog uses: a fresh
`useActionState` on every reopen instead of a stale error or a stale revealed token from the
previous open).

`CreateTokenDialogBody({ onOpenChange })`:
- `const [state, formAction, pending] = React.useActionState<TokenFormState, FormData>(createTokenAction, undefined);`
- `const announce = useAnnounce();`
- `React.useEffect(() => { if (state?.ok) announce(\`Created token ${state.data.name}.\`); }, [state, announce]);`
  - This effect only announces; it does not call `onOpenChange(false)`, because a successful create
    does not close the dialog - it swaps the form for the reveal state below, still inside the same
    open `DialogContent`.
- `state?.ok` is `true`: render the reveal state - `DialogTitle` `Copy your new token`; text `This is
  the only time the token is shown. Save it with jobsmith login.`; a read-only `Input` labelled `Your
  new token` (`readOnly`, `value={state.data.token}`, wrapped the same `FieldRow` way as every other
  field, with `className="break-all font-mono"` on the input itself: a real token is `jsm_` plus 43
  base64url characters with no spaces, the longest unbroken string this whole milestone ever
  renders); a `CopyButton value={state.data.token} label="Copy the token" />` beside it (the frame's
  own fixed `aria-label`, distinct from the visible `Copy` text `CopyButton` always shows); a `Button`
  `Done` (`ref={doneRef}`, `onClick={() => onOpenChange(false)}`) in a `DialogFooter`. A `useEffect`
  keyed on entering this state moves focus onto the read-only token field
  (`tokenInputRef.current?.focus()`) so the very next Tab reaches Copy - the submit button that was
  focused a moment ago is gone the instant this branch renders, and nothing in Base UI moves focus on
  its own here (the dialog itself never closes and reopens, so its usual open-focus behavior never
  fires a second time).
- Otherwise: render the create form - `DialogHeader`/`DialogTitle` `Create a token`; a top-level
  `role="alert"` message when `state?.ok === false` (`state.message`); one `FieldRow` `Name`
  (`hint={state?.ok === false ? state.fieldErrors?.name : undefined}`) wrapping an `Input`
  (`name="name"`, `aria-describedby`, `aria-invalid`); a hint paragraph under the field row, `A name
  that tells you where the token is used, like Laptop.` (the frame's own field hint, distinct from a
  validation error - both can be visible at once, the static hint above the dynamic error, matching
  `FieldRow`'s own single `hint` slot by rendering the static sentence as a second, always-present
  `<p>` rather than trying to fit both into one `hint` prop); `DialogFooter` with `Button type="submit"`
  `Create token` (`disabled={pending}`) and `Button type="button"` `Cancel`
  (`onClick={() => onOpenChange(false)}`). The form's own `onSubmit` is `submitViaTransition`, per the
  global rule every form in this milestone follows.

`RevokeTokenDialog({ open, onOpenChange, token }: { open: boolean; onOpenChange(open: boolean): void; token: { id: string; name: string } })`:
`Dialog`/`DialogContent`; `DialogHeader`/`DialogTitle` `Revoke this token`; text `\`${token.name}
stops working right away. This cannot be undone.\``; `DialogFooter` with `Button` `Revoke token`
(`variant="destructive"`) and `Button` `Cancel` (`onClick={() => onOpenChange(false)}`). No form, no
`useActionState`: this is a confirm-then-call action, the same shape as `board.tsx`'s `runClose` and
`runMove`, not a data-entry form.

```tsx
const [, startTransition] = React.useTransition();
const announce = useAnnounce();

function handleRevoke() {
  startTransition(async () => {
    try {
      const result = await revokeTokenAction(token.id);
      if (!result.ok) {
        toast.error(`Could not revoke ${token.name}. ${messageFor(result.code)}`);
        return;
      }
      onOpenChange(false);
      announce(`Revoked ${token.name}.`);
      // The dialog is still mid closing animation right here, holding
      // focus on its own "Revoke token" button - the same reasoning as
      // board.tsx's runClose/runMove: a one-time focusWasLost() check made
      // now would see focus as not lost yet and miss the loss that happens
      // once the animation actually finishes and this row's own "Revoke"
      // button has been replaced by plain "Revoked <date>" text.
      correctFocusOnceLost(() => {
        (document.querySelector("[data-token-create]") as HTMLElement | null)?.focus();
      });
    } catch (error) {
      console.error("revoke token failed", error);
      toast.error(`Could not revoke ${token.name}. ${messageFor("unexpected")}`);
    }
  });
}
```

The `Revoke token` button's `onClick` is `handleRevoke`; `disabled` while the transition is pending
covers the double-click case, matching every other confirm-and-call button in this milestone.

- [ ] **Step 5: Manual browser check**

With Tasks 1 to 10 built:

1. `pnpm dev`, sign in, confirm `Settings` appears in the sidebar after `Board`, and (below 768px)
   in the phone bottom bar after `Board`.
2. Open `/settings`. Confirm the h1, the `API tokens` heading, the intro sentence and (on a fresh
   account) `No tokens yet.`
3. Click `Create token`. Confirm focus lands in the `Name` field. Submit blank: confirm the field
   shows `Give the token a name.` and focus returns to `Create token`, without the dialog closing or
   losing the typed value (there is none here, but confirm the dialog itself stays open and usable).
   Type a name over 60 characters: confirm `Keep the name to 60 characters or fewer.`
4. Type `Laptop`, submit. Confirm the dialog switches to `Copy your new token` in place (no close/
   reopen flash), the token field is read-only and shows the full `jsm_...` value, `Copy` copies it
   (confirm by pasting elsewhere), and the live region announced `Created token Laptop.` Click
   `Done`; confirm the dialog closes and focus returns to `Create token`.
5. Confirm the new row shows `Laptop`, the eight-character prefix followed by an ellipsis in
   monospace, `Created <date>` and `Never used`.
6. Click `Revoke`, confirm the dialog's text names the token by name, click `Cancel` and confirm
   nothing changed. Click `Revoke` again, then `Revoke token`; confirm the row now shows `Revoked
   <date>` instead of a button, the live region announced `Revoked Laptop.`, and focus lands on
   `Create token` (inspect `document.activeElement`, or Tab immediately and confirm the very next
   stop is the field after it, never a page reload with focus reset to the top).
7. Resize to 390px wide; confirm no page-level horizontal scrollbar even with a long token name.
   Check both light and dark, then repeat the whole pass in Safari.

- [ ] **Step 6: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
```

Expected: all four exit 0. This task adds no new unit test file (Step 2's reasoning); `pnpm test`'s
count is unchanged from Task 10.

- [ ] **Step 7: Commit**

```bash
git add components/app-shell.tsx "app/(app)/settings/page.tsx" "app/(app)/settings/actions.ts" components/settings/api-tokens-section.tsx
git commit -m "$(cat <<'EOF'
feat: add Settings with API token create, reveal and revoke
EOF
)"
```

---

### Task 12: Paste dialog, Research and Prep

**Files:**
- Create: `app/(app)/jobs/[slug]/document-actions.ts`, `components/job/paste-dialog.tsx`, `components/job/document-list.tsx`, `components/job/document-view.tsx`, `components/job/tab-research.tsx`, `components/job/tab-prep.tsx`, `components/job/bridge-panel.tsx`
- Modify: `app/(app)/jobs/[slug]/page.tsx`, `components/job/job-tabs.tsx`

**Interfaces:**
- Consumes: `pasteArtifact`, `PasteTarget`, `PasteInput` (`@/lib/artifacts/paste.ts`, Task 4). `pasteTargetSchema`, `pasteFormSchema`, `PasteFormState` (`@/lib/artifacts/forms.ts`, Task 4). `UpsertResult` (`@/lib/artifacts/upsert.ts`, Task 4). `getDocument`, `DocumentView` as a type (`@/lib/artifacts/read.ts`, Task 4; the component of the same name below is unrelated and defined in this task). `DocRef`, `parseDocRef`, `formatDocRef`, `scopeOf`, `docsForTab`, `researchGroups`, `prepGroups`, `selectDoc`, `DocGroup` (`@/lib/artifacts/tabs.ts`, Task 3). `ArtifactKind`, `ArtifactTab`, `ARTIFACT_KINDS`, `kindInfo`, `DEFAULT_KIND_FOR_TAB` (`@/lib/artifacts/kinds.ts`, Task 1). `ArtifactScope` (`@/lib/artifacts/values.ts`, Task 1). `ArtifactMeta`, `ArtifactRow`, `Scoped`, `StageRow` (`@/lib/db/scoped`, Task 2/Milestone 2). `JobView` (`@/lib/pipeline/read.ts`, gains `documents` in Task 4). `Markdown` (`@/components/markdown.tsx`, Task 10). `CopyButton` (`@/components/copy-button.tsx`, Task 10). `messageFor` (`@/lib/pipeline/messages.ts`, Task 4 adds `artifact_not_found`). `submitViaTransition` (`@/lib/forms/submit.ts`). `useAnnounce` (`@/components/live-announcer.tsx`). `FieldRow` (`@/components/super-ai/field-row.tsx`). `EmptyState` (`@/components/super-ai/empty-state.tsx`). `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`, `Select` family, `Textarea`, `Input`, `Button` (`@/components/ui/*`). `useRouter` from `"next/navigation"`. `toast` from `"sonner"`. Everything Tasks 10 and 11 produce.
- Produces (copied from the frame character for character):

```typescript
// app/(app)/jobs/[slug]/document-actions.ts
export async function pasteDocumentAction(
  opportunityId: string,
  target: PasteTarget,
  _prev: PasteFormState,
  formData: FormData,
): Promise<PasteFormState>;
// components/job/paste-dialog.tsx
export function PasteDialogTrigger(props: {
  opportunityId: string;
  target: PasteTarget;
  defaultKind: ArtifactKind;
  stages: { id: string; label: string }[];
  initial?: { title: string; kind: ArtifactKind; stageId: string | null };
  label: string;
  ariaLabel?: string;
}): React.ReactElement;
// components/job/document-list.tsx
export function DocumentList(props: {
  label: string;
  groups: DocGroup[];
  selected: DocRef | null;
  basePath: string;
  tab: ArtifactTab;
}): React.ReactElement;
// components/job/document-view.tsx
export function DocumentView(props: {
  doc: ArtifactRow;
  companyName: string | null;
  stageLabel: string | null;
  actions: React.ReactNode;
  children?: React.ReactNode;
}): React.ReactElement;
```

Two new tabs (Research, Prep) and one dialog (paste, reused by both, and by Documents in Task 13).

**Why `PasteDialogTrigger` takes no `basePath` but `DocumentList` does.** On a successful paste, the
dialog navigates client-side with `router.push` (Task 12, this file), and a bare query string such
as `"?tab=research&doc=job:cv"` resolves against whatever path the browser is already on - no path is
ever needed. `DocumentList` is a Server Component building real `<Link href>` values with no
client-side router to resolve a bare query string against, so its own `basePath` (`` `/jobs/${slug}` ``,
computed once in `page.tsx`) is threaded in explicitly. Same underlying URL shape, two different
mechanisms for a client navigation versus a server-rendered link.

**Design note carried into Research and Prep.** `TabResearch` and `TabPrep` (both server, both
`async function`s) receive `s: Scoped` as a prop, alongside the plain data `page.tsx` already
resolved from `getJobView`. This matches Milestone 2's rule that database access happens only
through `scopedFor`/a `Scoped`-taking `lib/` function, never a direct `@/lib/db/client` import - a
component receiving `Scoped` as a prop and calling `getDocument`/`s.artifact.listLatestForCompany`
itself still only ever reaches the database through those `lib/` functions. It differs from
Milestone 2's own job-page tabs (`TabPeople`, `TabTimeline`), which needed no extra query beyond what
`getJobView` already loaded once for the whole page; Research and Prep each need one further,
selection-dependent read (the one chosen document's full body, and Research's own company-wide
documents), and doing that inside the tab itself - not duplicated ad hoc inside `page.tsx` for each
of three tabs - is what keeps `page.tsx` from turning into a second copy of every tab's own grouping
logic.

**The three risks this task carries, restated from Milestone 2 and checked in Step 8's manual pass:**
(1) a rejected paste must leave the typed title, kind, stage and markdown exactly as the user left
them - `submitViaTransition` guarantees this, but only if nothing else in the form resets on failure;
(2) after a successful paste the dialog closes and the page navigates to the new document, so focus
must land somewhere real, never `<body>`, once the dialog's own closing animation finishes; (3) the
Markdown textarea, a document's own rendered body, and a company's shared-document heading can all
contain a long unbroken string (a URL with no spaces, a token, a slug) with no other wrap point, so
every one of them needs `break-words` and every table or code block needs its own horizontally
scrollable, keyboard-focusable container - `components/markdown.tsx` (Task 10) already supplies the
second half of that; this task only has to avoid undoing it with a container that clips instead of
scrolling.

- [ ] **Step 1: Write `app/(app)/jobs/[slug]/document-actions.ts` in full**

No dedicated unit test file: `pasteDocumentAction` is a thin wrapper over already-tested
`pasteArtifact` (Task 4's own integration tests cover every rule the planner can produce), the same
reasoning Task 11's token actions and every plain M2 job-page action used. Task 14's `documents.spec.ts`
pastes a real document through this action end to end.

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import type { Scoped } from "@/lib/db/scoped";
import { pasteArtifact, type PasteTarget } from "@/lib/artifacts/paste";
import { pasteTargetSchema, pasteFormSchema, type PasteFormState } from "@/lib/artifacts/forms";
import { messageFor } from "@/lib/pipeline/messages";
import type { ArtifactScope } from "@/lib/artifacts/values";

// Shared by every write action in this file: each one revalidates the
// target job's own page and, for a company-scoped change, every other job
// at that company, the same two-step lookup app/(app)/jobs/[slug]/actions.ts's
// own revalidateJob does for a single job.
export async function revalidateDocuments(s: Scoped, opportunityId: string, scope: ArtifactScope) {
  const opportunity = await s.opportunity.getById(opportunityId);
  if (!opportunity) return;
  revalidatePath(`/jobs/${opportunity.slug}`);
  if (scope === "company") {
    const slugs = await s.opportunity.listSlugsForCompany(opportunity.companyId);
    for (const slug of slugs) {
      if (slug !== opportunity.slug) revalidatePath(`/jobs/${slug}`);
    }
  }
}

export async function pasteDocumentAction(
  opportunityId: string,
  target: PasteTarget,
  _prev: PasteFormState,
  formData: FormData,
): Promise<PasteFormState> {
  const user = await requireUser();
  const idParsed = z.uuid().safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const targetParsed = pasteTargetSchema.safeParse(target);
  if (!targetParsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid") };
  }
  const fieldsParsed = pasteFormSchema.safeParse({
    title: formData.get("title"),
    kind: formData.get("kind"),
    stageId: formData.get("stageId") ?? "",
    bodyMd: formData.get("bodyMd"),
  });
  if (!fieldsParsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: messageFor("invalid"),
      fieldErrors: fieldErrorsFromZod(fieldsParsed.error),
    };
  }
  const s = scopedFor(user.id);
  const result = await pasteArtifact(s, opportunityId, { target: targetParsed.data, ...fieldsParsed.data });
  if (!result.ok) {
    return { ok: false, code: result.code, message: messageFor(result.code) };
  }
  await revalidateDocuments(s, opportunityId, result.data.scope);
  return { ok: true, data: result.data };
}
```

Add `import { fieldErrorsFromZod } from "@/lib/forms/state";` alongside the other imports at the top
(omitted above only to keep the two import blocks visually separate in this text; both belong at the
top of the one file). `targetParsed`'s own failure has no `fieldErrors` entry, matching the frame's
own note that `pasteTargetSchema`'s failure message "is never shown for input a person types; the
app builds every target itself" - a `PasteTarget` mismatch here means a wiring bug in this file or in
`paste-dialog.tsx`, not a correction a user needs worded field by field.

- [ ] **Step 2: Update `components/job/job-tabs.tsx` in full**

```tsx
"use client";

import { useRouter } from "next/navigation";

import { DetailTabs, type DetailTabItem } from "@/components/super-ai/detail-tabs";

export type JobTabId = "overview" | "research" | "people" | "timeline" | "prep";

// No `count` on any of these: the frame's fixed copy for these tabs carries
// no badge count, and DetailTabs's `count` is optional.
const TAB_ITEMS: DetailTabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "research", label: "Research" },
  { id: "people", label: "People" },
  { id: "timeline", label: "Timeline" },
  { id: "prep", label: "Prep" },
];

export function JobTabs({ activeTab, basePath }: { activeTab: JobTabId; basePath: string }) {
  const router = useRouter();

  return (
    <DetailTabs
      items={TAB_ITEMS}
      activeId={activeTab}
      onSelect={(id) => router.push(`${basePath}?tab=${id}`, { scroll: false })}
      ariaLabel="Job sections"
      // Five tabs do not fit one row at 390px; DetailTabs has no overflow
      // handling of its own, so wrapping to a second row is what keeps
      // every tab reachable without horizontal scrolling, rather than the
      // tab strip forcing the whole page wider than the viewport.
      className="flex-wrap"
    />
  );
}
```

Task 13 inserts `"documents"` into `JobTabId` and `TAB_ITEMS` between `"people"` and `"timeline"`;
nothing else in this file changes again after that.

- [ ] **Step 3: Update `app/(app)/jobs/[slug]/page.tsx` in full**

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { getJobView } from "@/lib/pipeline/read";
import { toOpportunityState, stageControlsFor } from "@/lib/pipeline/stage-controls";
import { parseDocRef } from "@/lib/artifacts/tabs";
import { JobHeader } from "@/components/job/job-header";
import { StageStepper } from "@/components/job/stage-stepper";
import { NextActionBar } from "@/components/job/next-action-bar";
import { JobTabs, type JobTabId } from "@/components/job/job-tabs";
import { TabOverview } from "@/components/job/tab-overview";
import { TabResearch } from "@/components/job/tab-research";
import { TabPeople } from "@/components/job/tab-people";
import { TabTimeline } from "@/components/job/tab-timeline";
import { TabPrep } from "@/components/job/tab-prep";

const TAB_IDS: readonly JobTabId[] = ["overview", "research", "people", "timeline", "prep"];

function resolveTab(value: string | string[] | undefined): JobTabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value) ? (value as JobTabId) : "overview";
}

export default async function JobPage(props: PageProps<"/jobs/[slug]">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const s = scopedFor(user.id);
  const view = await getJobView(s, slug);
  if (!view) {
    notFound();
  }

  const state = toOpportunityState(view);
  const controls = stageControlsFor(state, new Date());
  const tab = resolveTab(searchParams.tab);
  const docRef = parseDocRef(searchParams.doc);
  const stageOptions = view.stages.map((stage) => ({ id: stage.id, label: stage.label }));
  const basePath = `/jobs/${slug}`;

  return (
    <div className="flex flex-col gap-6 p-6">
      <JobHeader opportunity={view.opportunity} companyName={view.company.name} />
      <StageStepper
        opportunity={view.opportunity}
        companyName={view.company.name}
        stages={view.stages}
        currentStageId={view.opportunity.currentStageId!}
        controls={controls}
      />
      <NextActionBar opportunity={view.opportunity} />
      <div>
        <JobTabs activeTab={tab} basePath={basePath} />
        {tab === "overview" && (
          <TabOverview opportunity={view.opportunity} company={view.company} opportunityId={view.opportunity.id} />
        )}
        {tab === "research" && (
          <TabResearch
            s={s}
            opportunityId={view.opportunity.id}
            companyId={view.company.id}
            companyName={view.company.name}
            jobDocuments={view.documents}
            docRef={docRef}
            basePath={basePath}
            stages={stageOptions}
          />
        )}
        {tab === "people" && (
          <TabPeople opportunityId={view.opportunity.id} stages={stageOptions} people={view.people} />
        )}
        {tab === "timeline" && <TabTimeline opportunityId={view.opportunity.id} events={view.events} />}
        {tab === "prep" && (
          <TabPrep
            s={s}
            opportunityId={view.opportunity.id}
            companyId={view.company.id}
            jobDocuments={view.documents}
            docRef={docRef}
            basePath={basePath}
            stages={view.stages}
            slug={slug}
          />
        )}
      </div>
    </div>
  );
}
```

`view.stages` is already position-sorted (`s.stage.listForOpportunity`'s own contract, unchanged
since Milestone 2), which is exactly the ordering `prepGroups` needs and the frame notes it does not
re-sort itself expecting from a caller - so it is passed straight into `TabPrep`, no separate mapped
array. Task 13 adds one more branch (`tab === "documents"`) between the `people` and `timeline`
branches above, and threads a parsed `v` search param through to it; nothing above this line changes
again in Task 13.

- [ ] **Step 4: Build `components/job/paste-dialog.tsx`**

Client component (`"use client"`; it holds dialog-open state, calls `useActionState` and navigates
with `useRouter`).

```typescript
export function PasteDialogTrigger(props: {
  opportunityId: string;
  target: PasteTarget;
  defaultKind: ArtifactKind;
  stages: { id: string; label: string }[];
  initial?: { title: string; kind: ArtifactKind; stageId: string | null };
  label: string;
  ariaLabel?: string;
}): React.ReactElement;
```

Structure:
- A `Button` trigger: visible text `props.label`, `aria-label={props.ariaLabel ?? props.label}` (the
  plain `Paste markdown` buttons on each tab pass no `ariaLabel` and are read by their own visible
  text; the per-document "Paste a new version" button on `DocumentView`'s own actions row passes
  `ariaLabel={`Paste a new version of ${title}`}`, the frame's own fixed name for that one case).
  `onClick` opens local `open` state (`useState<boolean>`).
- `Dialog`/`DialogContent` wraps a `PasteForm` (a separate component inside `DialogContent`, the same
  `AddJobForm`/`EditDetailsForm`/`PersonForm` reasoning every Milestone 2 dialog uses: a fresh
  `useActionState` on every reopen, never a stale error or a stale typed body from the previous
  open).

`PasteForm({ onOpenChange, opportunityId, target, defaultKind, stages, initial, ... })`:
- `const scope: ArtifactScope = target.mode === "version" ? target.scope : "opportunity";` - D25: a
  brand-new paste is always job-scoped (`pasteArtifact`'s own Step 5 hard-codes this), so only
  "paste a new version" of an existing company-scoped document (Research's shared documents) is ever
  company-scoped here.
- `const kindItems: Record<string, string> = Object.fromEntries((scope === "company" ? ARTIFACT_KINDS.filter((k) => k.companyWide) : ARTIFACT_KINDS).map((k) => [k.kind, k.label]));`
- `const stageItems: Record<string, string> = { "": "No stage", ...Object.fromEntries(stages.map((st) => [st.id, st.label])) };`
- `const action = pasteDocumentAction.bind(null, opportunityId, target);`
- `const [state, formAction, pending] = React.useActionState<PasteFormState, FormData>(action, undefined);`
- `const router = useRouter();`
- `const announce = useAnnounce();`
- `const submitRef = React.useRef<HTMLButtonElement>(null);`
- `const lastTitleRef = React.useRef("");` - captured synchronously in the form's own `onSubmit`
  (`lastTitleRef.current = String(new FormData(event.currentTarget).get("title") ?? "")`), the same
  `add-job-dialog.tsx` idiom for a value a failure path needs but `PasteFormState`'s own failure
  branch carries no data for.
- `DialogTitle`: `target.mode === "new" ? "Paste markdown" : "Paste a new version"` (the frame's own
  two fixed titles).
- A top-level `role="alert"` line when `state?.ok === false`, showing `state.message`.
- The four fields, in this order, each a `FieldRow` (matching every other Milestone 2 form's
  `hint`-from-`fieldErrors` and `aria-describedby`/`aria-invalid` wiring), inside a `max-h-96
  overflow-y-auto` scroll region (the same convention `add-job-dialog.tsx` and `edit-stages-dialog.tsx`
  use once a dialog's own field list can outgrow the viewport):
  - `Title`: `Input name="title" defaultValue={initial?.title ?? ""}`.
  - `Kind`: `Select name="kind" items={kindItems} defaultValue={initial?.kind ?? defaultKind}`, one
    `SelectItem` per entry of `kindItems`.
  - `Stage`: rendered only when `scope !== "company"` (a company-shared document has no stage - D18,
    backed in the database by `artifact_company_stage_check`). `Select name="stageId"
    items={stageItems} defaultValue={initial?.stageId ?? ""}`, a leading `SelectItem value=""` reading
    `No stage`, then one per job stage.
  - `Markdown`: `Textarea name="bodyMd" rows={12} className="font-mono break-words" defaultValue=""`.
- `DialogFooter`: `Button type="submit"` `Save` (`ref={submitRef}`, `disabled={pending}`) and
  `Button type="button"` `Cancel` (`onClick={() => onOpenChange(false)}`).
- The form itself: `<form onSubmit={(event) => { lastTitleRef.current = ...; submitViaTransition(event, formAction); }} noValidate className="flex flex-col gap-4">`.

Wiring, the part easy to get wrong:

```tsx
React.useEffect(() => {
  if (state?.ok) {
    const sentence =
      state.data.status === "created" || state.data.status === "edited"
        ? `Saved ${state.data.title}.`
        : state.data.status === "versioned"
          ? `Saved ${state.data.title} as version ${state.data.version}.`
          : state.data.status === "updated"
            ? `Updated the details of ${state.data.title}.`
            : "Nothing changed. This text is already the latest version.";
    announce(sentence);
    onOpenChange(false);
    // A bare query string, resolved against whatever path is already open -
    // no basePath needed here, unlike DocumentList's server-rendered <Link>s.
    router.push(
      `?tab=${state.data.tab}&doc=${formatDocRef({ scope: state.data.scope, key: state.data.key })}`,
      { scroll: false },
    );
  } else if (state?.ok === false) {
    if (state.code !== "invalid") {
      // Not a field the user can fix by looking at this form - the job or
      // the specific document this dialog targets no longer exists (an
      // unusual concurrent-edit case, not something a person types wrong).
      toast.error(`Could not save ${lastTitleRef.current || "the document"}. ${messageFor(state.code)}`);
    }
    // Chromium disabled-focus-loss fix, same as every other Milestone 2
    // form: Save is disabled only while pending, never removed, so it is
    // reachable to refocus on every failure, field-level or not.
    submitRef.current?.focus();
  }
}, [state, onOpenChange, announce, router]);
```

`pasteArtifact` never produces `"unchanged"` with a warning on this path (`sent_locked` only applies
to the bridge's own metadata-only path per D14; a paste dialog user is always changing the body
itself, so the plain `Nothing changed.` sentence is the one case a repeated identical paste can reach
here). The `"invalid"` branch renders inline through `fieldErrors` (no toast): this is the only
failure code `pasteFormSchema` itself can produce, and every other form in this milestone treats a
validation failure the same way, inline under the field it names. Because `submitViaTransition` never
enters the native `<form action>` dispatch path, `requestFormReset` never fires on any outcome, so
the typed title, kind, stage and markdown all survive a rejection exactly as the user left them (the
first named risk above).

- [ ] **Step 5: Build `components/job/document-list.tsx`**

Server component.

```typescript
export function DocumentList(props: {
  label: string;
  groups: DocGroup[];
  selected: DocRef | null;
  basePath: string;
  tab: ArtifactTab;
}): React.ReactElement;
```

Structure:
- `<nav aria-label={props.label}>` (Research passes `"Research documents"`, Prep passes `"Prep
  documents"`, and Documents, Task 13, passes `"Documents list"` - the frame's three fixed nav
  names).
- For each `group` in `props.groups`: an `<h2>{group.heading}</h2>` only when `group.heading !== ""`
  (Documents, Task 13, passes one group whose `heading` is the empty string, so Documents renders no
  group heading at all - a flat list - while Research's `"This job"`/`"Shared with every job at
  <company>"` and Prep's `"General"`/each stage label both render theirs).
- `<ul>` of one `<li>` per `group.docs` entry:
  - `const ref = { scope: scopeOf(doc), key: doc.key };`
  - `<Link href={`${props.basePath}?tab=${props.tab}&doc=${formatDocRef(ref)}`} aria-current={props.selected && ref.scope === props.selected.scope && ref.key === props.selected.key ? "true" : undefined} className="break-words font-medium text-foreground">{doc.title}</Link>`
    - The link's own content is the title text alone and nothing else, so the title is its whole
      accessible name (the frame's own "list item link name = the document title"); the meta line
      below sits in a sibling element, never inside the `<a>`.
  - `<p className="text-xs text-muted-foreground">{`${kindInfo(doc.kind).label} · v${doc.version}`}{doc.sentAt ? " · Sent" : ""}</p>`

`aria-current="true"` (a literal string, matching `add-job-dialog.tsx`'s and every other selected-item
convention in this repo of setting the attribute to the string `"true"` rather than the boolean
`true`, since `aria-current` is a token attribute) marks the one document currently open, so a screen
reader user tabbing through the list hears which one is already selected without having to cross-
reference the visible document view.

- [ ] **Step 6: Build `components/job/document-view.tsx`**

Server component.

```typescript
export function DocumentView(props: {
  doc: ArtifactRow;
  companyName: string | null;
  stageLabel: string | null;
  actions: React.ReactNode;
  children?: React.ReactNode;
}): React.ReactElement;
```

Structure:
- `const titleId = React.useId();`
- `<article aria-labelledby={titleId}>`
  - `<h2 id={titleId} tabIndex={-1} data-document-title className="text-lg font-semibold text-foreground outline-none">{props.doc.title}</h2>`
    - `data-document-title`: the plain marker selector Task 13's `mark-sent-dialog.tsx` and
      `document-editor.tsx` use as a focus fallback target once a more specific one (the Edit
      button, the Mark as sent button) is not available. `tabIndex={-1}`: programmatically
      focusable without joining the normal Tab order, the same convention every other
      recovery-focus target that is a heading rather than a control uses elsewhere in this repo.
  - The meta line, parts present joined with `" · "` (the frame's own separator): `kindInfo(props.doc.kind).label`; `` `Version ${props.doc.version}` ``; `` `${ORIGIN_WORDS[props.doc.origin]} ${...}` `` rendered with the origin word as plain text and the date through `<LocalTime value={props.doc.createdAt} mode="date" />` inside the same joined line (built as an array of `React.ReactNode`, not a single template string, precisely because a `LocalTime` element cannot be flattened into a plain string); `` `Edited ` `` plus `<LocalTime value={props.doc.editedAt} mode="date" />` when `props.doc.editedAt` is set; `` `Sent ` `` plus `<LocalTime value={props.doc.sentAt} mode="date" />` when `props.doc.sentAt` is set; `props.stageLabel` verbatim when given; `` `Shared with every job at ${props.companyName}` `` when `props.companyName` is given (company scope).
  - `<div className="flex flex-wrap items-center gap-2">{props.actions}</div>`.
  - `props.children ?? <Markdown source={props.doc.bodyMd} headingBase={3} />` - when `children` is
    given (Task 13's Documents editor island), it fully replaces the rendered body; Research and
    Prep (this task) never pass `children`, so they always get the plain rendered body.

Building the meta line as an array of nodes rather than a template string, joined with a small
helper that inserts `" · "` between non-null entries, is what lets a `LocalTime` element sit between
two plain-text parts without stringifying it - the same reason `tab-timeline.tsx`'s own event rows
never try to interpolate `LocalTime` into a template literal either.

- [ ] **Step 7: Build `components/job/tab-research.tsx`**

Server component, `async function` (it fetches the company's shared documents and the one selected
document's full body itself; see the design note above the steps).

```typescript
export async function TabResearch(props: {
  s: Scoped;
  opportunityId: string;
  companyId: string;
  companyName: string;
  jobDocuments: ArtifactMeta[];
  docRef: DocRef | null;
  basePath: string;
  stages: { id: string; label: string }[];
}): Promise<React.ReactElement>;
```

Body:
1. `const companyDocuments = await props.s.artifact.listLatestForCompany(props.companyId);`
2. `const groups = researchGroups(props.jobDocuments, companyDocuments, props.companyName);` - takes
   the FULL, un-filtered document lists for both scopes; `researchGroups` filters to the three
   Research kinds internally (the frame's own note: callers never pre-filter).
3. `const selected = selectDoc(groups, props.docRef);`
4. `<section aria-label="Research" className="flex flex-col gap-4 py-4">`
   - A header row holding `<PasteDialogTrigger opportunityId={props.opportunityId} target={{ mode: "new" }} defaultKind={DEFAULT_KIND_FOR_TAB.research} stages={props.stages} label="Paste markdown" />`.
   - `selected === null`: `<EmptyState size="panel" title="No research yet." description="Push research from the command line or paste markdown." />` - the frame's fixed empty-state title and text.
   - Otherwise, a responsive two-part layout (this task's own layout choice; the frame fixes the
     concept - a navigation list and one selected document - not the exact classes): `<div
     className="flex flex-col gap-6 md:flex-row md:items-start">`, `<div className="md:w-64
     md:shrink-0"><DocumentList label="Research documents" groups={groups} selected={props.docRef}
     basePath={props.basePath} tab="research" /></div>`, then, in a `<div className="min-w-0
     md:flex-1">` (`min-w-0`: without it a flex sibling floors at its content's width, and a wide
     table or an unbroken long string inside the document view would push this column - and the
     whole page - wider than the viewport, the same reasoning `app-shell.tsx`'s own `SidebarInset`
     comment gives for the identical fix):
     - `const scope = scopeOf(selected);`
     - `const doc = (await getDocument(props.s, { opportunityId: props.opportunityId, companyId: props.companyId }, { scope, key: selected.key }))!;` - non-null: `selected` was chosen from `groups`, which was built from the very documents that make this lookup succeed.
     - `const stageLabel = props.stages.find((st) => st.id === doc.current.stageId)?.label ?? null;`
     - `<DocumentView doc={doc.current} companyName={scope === "company" ? props.companyName : null} stageLabel={stageLabel} actions={<PasteDialogTrigger opportunityId={props.opportunityId} target={{ mode: "version", scope, key: selected.key }} defaultKind={doc.current.kind} stages={props.stages} initial={{ title: doc.current.title, kind: doc.current.kind, stageId: doc.current.stageId }} label="Paste a new version" ariaLabel={`Paste a new version of ${doc.current.title}`} />} />`

- [ ] **Step 8: Build `components/job/tab-prep.tsx` and `components/job/bridge-panel.tsx`**

`tab-prep.tsx`, server, `async function`, the same shape as `tab-research.tsx` with two differences:
Prep documents are always job-scoped (no company sharing - Prep kinds are never `companyWide`, D18),
so `DocumentView`'s `companyName` prop is always `null` here, and the bridge panel replaces Research's
plain header row.

```typescript
export async function TabPrep(props: {
  s: Scoped;
  opportunityId: string;
  companyId: string;
  jobDocuments: ArtifactMeta[];
  docRef: DocRef | null;
  basePath: string;
  stages: StageRow[]; // position-sorted; prepGroups sorts its own copy again regardless
  slug: string;
}): Promise<React.ReactElement>;
```

Body:
1. `const groups = prepGroups(props.jobDocuments, props.stages);`
2. `const selected = selectDoc(groups, props.docRef);`
3. `<section aria-label="Prep" className="flex flex-col gap-4 py-4">`
   - `<BridgePanel slug={props.slug} opportunityId={props.opportunityId} stages={props.stages.map((st) => ({ id: st.id, label: st.label }))} />`
   - `selected === null`: `<EmptyState size="panel" title="No prep documents yet." description="Push a prep packet from the command line or paste markdown." />`
   - Otherwise the same `DocumentList`/`DocumentView` layout as Research (`label="Prep documents"`,
     `tab="prep"`), fetching `getDocument(props.s, { opportunityId: props.opportunityId, companyId: props.companyId }, { scope: "opportunity", key: selected.key })` (Prep's `selected.scope` is always `"opportunity"`, since `prepGroups` only ever groups job-scoped documents), `stageLabel` from `props.stages`, `companyName` always `null`, and the same `PasteDialogTrigger` "Paste a new version" actions button.

`bridge-panel.tsx`, server (no interactivity of its own beyond the `CopyButton`s and
`PasteDialogTrigger`, both already client components it composes, the same "mostly static, one
interactive child" shape as `tab-overview.tsx`).

```typescript
export function BridgePanel(props: {
  slug: string;
  opportunityId: string;
  stages: { id: string; label: string }[];
}): React.ReactElement;
```

Structure, copy fixed by the frame character for character:
- `<h3>Bring documents in</h3>`
- `<p>Pull this job's context, write documents next to it, then push the folder.</p>`
- Two rows, `Pull` and `Push`, each a label plus a `<code className="break-all">` holding the exact
  command and a `CopyButton` beside it:
  - `` `jobsmith pull ${props.slug}` ``, `<CopyButton value={`jobsmith pull ${props.slug}`} label="Copy the pull command" />`
  - `` `jobsmith push ${props.slug}` ``, `<CopyButton value={`jobsmith push ${props.slug}`} label="Copy the push command" />`
- `<p>{`Push reads the ${props.slug}-*.md files in the current folder. Add --prefix when your files start with something else.`}</p>`
- `<Link href="/settings">Create a token in Settings</Link>`
- `<PasteDialogTrigger opportunityId={props.opportunityId} target={{ mode: "new" }} defaultKind={DEFAULT_KIND_FOR_TAB.prep} stages={props.stages} label="Paste markdown" />`

`break-all` on the `<code>` elements: a slug is user-chosen text slugified with no length ceiling
enforced anywhere in this milestone beyond what Milestone 2 already gives it, so `jobsmith push
<slug>` is exactly the kind of long-unbroken-string risk named above.

- [ ] **Step 9: Manual browser check**

With Tasks 1 to 11 built and at least one seeded job:

1. `pnpm dev`, sign in, open a job. Confirm the tab strip now reads Overview, Research, People,
   Timeline, Prep (Documents arrives in Task 13) and wraps to a second row at 390px wide instead of
   forcing the page wider.
2. Open Research on a job with no documents yet: confirm `No research yet.` and the description
   text. Click `Paste markdown`; confirm the dialog title is `Paste markdown`, Kind offers all 12
   kinds, Stage offers `No stage` plus every job stage. Submit with a blank title: confirm `Give the
   document a title.` under Title, the dialog stays open, and the markdown text you typed is still
   there. Fill in a title, pick kind `Research`, paste a short markdown body with a heading, a link
   and a table, submit: confirm the dialog closes, the URL gains `?tab=research&doc=job:<key>`, the
   live region announced `Saved <title>.`, and the document now appears in the list and renders with
   its heading, a working link and a horizontally scrollable table.
3. Click `Paste a new version`; confirm the title reads `Paste a new version`, Title/Kind/Stage are
   pre-filled with the current document's own values, and its `aria-label` (inspect the accessibility
   tree) is `Paste a new version of <title>`. Paste the exact same body again and submit: confirm the
   live region says `Nothing changed. This text is already the latest version.` Change the body and
   submit: confirm `Saved <title> as version 2.`
4. Switch to Prep on the same job: confirm the bridge panel shows both commands with the job's real
   slug, that each `Copy` button copies its own command (paste elsewhere to confirm), and that
   `Create a token in Settings` opens `/settings`. Confirm `No prep documents yet.` before any prep
   document exists, then paste one and confirm it appears grouped under `General`.
5. At 390px wide, confirm neither Research nor Prep produces a page-level horizontal scrollbar even
   with a wide pasted table (measure `document.documentElement.scrollWidth <=
   window.innerWidth`, not just a visual glance).
6. Check both light and dark, then repeat the whole pass in Safari.

- [ ] **Step 10: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
```

Expected: all four exit 0. This task adds no new unit test file (Step 1's reasoning); `pnpm test`'s
count is unchanged from Task 11.

- [ ] **Step 11: Commit**

```bash
git add "app/(app)/jobs/[slug]/document-actions.ts" "app/(app)/jobs/[slug]/page.tsx" components/job/paste-dialog.tsx components/job/document-list.tsx components/job/document-view.tsx components/job/tab-research.tsx components/job/tab-prep.tsx components/job/bridge-panel.tsx components/job/job-tabs.tsx
git commit -m "$(cat <<'EOF'
feat: add the paste dialog and the Research and Prep tabs
EOF
)"
```

---

### Task 13: Documents: editor, versions, Mark as sent

**Files:**
- Create: `components/job/tab-documents.tsx`, `components/job/document-editor.tsx`, `components/job/mark-sent-dialog.tsx`, `components/job/version-list.tsx`
- Modify: `app/(app)/jobs/[slug]/document-actions.ts`, `app/(app)/jobs/[slug]/page.tsx`, `components/job/job-tabs.tsx`

**Interfaces:**
- Consumes: everything Tasks 10 and 12 produce, plus: `saveArtifactEdit` (`@/lib/artifacts/edit.ts`, Task 4). `markArtifactSent` (`@/lib/artifacts/sent.ts`, Task 4). `editFormSchema`, `EditFormState` (`@/lib/artifacts/forms.ts`, Task 4). `versionNotice` (`@/lib/artifacts/plan.ts`, Task 3). `ORIGIN_WORDS`, `kindInfo` (`@/lib/artifacts/kinds.ts`/`values.ts`, Task 1). `KEY_PATTERN` (`@/lib/bridge/wire.ts`, Task 3). `formatDocRef`, `docsForTab`, `selectDoc` (`@/lib/artifacts/tabs.ts`, Task 3). `ModeTabs` (`@/components/super-ai/mode-tabs.tsx`; props `{ modes: { value: string; label: string }[]; value?: string; onValueChange?(value: string): void; label?: string }`, a client component whose `label` prop is the whole group's accessible name). `correctFocusOnceLost` (`@/lib/dom/focus.ts`).
- Produces (copied from the frame character for character):

```typescript
// app/(app)/jobs/[slug]/document-actions.ts
export async function saveDocumentEditAction(
  opportunityId: string,
  key: string,
  _prev: EditFormState,
  formData: FormData,
): Promise<EditFormState>;
export async function markDocumentSentAction(opportunityId: string, key: string, version: number): Promise<Result<null, string>>;
```

Documents tab, the editor, the version list and the sent lock. `JobTabs` inserts Documents after
People (D24's final tab order: Overview, Research, People, Documents, Timeline, Prep).

**Why Edit lives inside `document-editor.tsx`, never in `DocumentView`'s `actions` prop.**
`DocumentView`'s `actions` is rendered by a Server Component (`TabDocuments`) once, before any
client interaction happens; the choice of whether the body shows as rendered markdown or as an open
editor is client-only state (`editing`, a `useState`). A server-rendered button in `actions` cannot
toggle state that lives in a completely separate client component passed through `children` - there
is no shared state between two sibling trees unless one contains the other. `document-editor.tsx`
therefore owns both halves: the `Edit` button (visible only while not editing) and the body-or-editor
content beneath it, all inside the one `children` slot `DocumentView` gives it. `Mark as sent` and
`Paste a new version`, by contrast, are each a self-contained dialog with no shared state to
coordinate with the editor, so they stay in `DocumentView`'s own server-rendered `actions` row.

**Resolving the frame's two version notices into one conditional banner.** The frame's fixed copy
lists both `` `You are viewing version <n>. The latest is version <m>.` `` ("Older version") and
`` `This version was sent and stays read-only.` `` ("Sent version") as distinct sentences, but Task
13's own prose says only "Viewing an older version shows the older-version notice" (singular) - one
banner, not two stacked ones. Read together with D26 (only the latest version can ever be edited
forward; every older version, sent or not, is permanently read-only, which is exactly what makes it
"older" in the first place), the two sentences are alternative texts for the same banner, chosen by
whether the specific older version being viewed was itself the one sent: sent, the banner reads `This
version was sent and stays read-only.`; not sent (superseded by a later push, paste or edit but never
itself marked sent), it reads `You are viewing version <n>. The latest is version <m>.` Either way the
same `Open the latest version` link follows it, and this banner (together with the whole `Edit`
affordance) only ever appears for a version that is *not* the current latest - a sent *latest*
version keeps `Edit` available (D26: editing it forks a new version) and shows its own warning
sentence, `Version <n> was sent. Saving creates version <m>.`, inside the editor itself once opened,
never this banner.

**The four risks this task carries, three restated from Milestone 2 and one new to Documents:**
(1) focus never on `<body>` after Save, Cancel or a Mark as sent confirmation, each of which removes
or disables the control that had focus; (2) a rejected Save keeps the typed markdown exactly as
typed, never reverting to the server's own last-saved body; (3) axe zero violations on the editor
itself, in both view states, light and dark; (4) new to this task - once a version is sent it must
stay provably read-only from every angle: no `Edit`... no, `Edit` *is* still offered on a sent
*latest* (that is the one place D26 allows it, by forking), so the actual invariant this task's
manual check has to prove is narrower and easy to get backwards: `Edit` never appears on an *older*
version regardless of its own sent state, and a sent version, latest or not, is never silently
overwritten in place - saving from it always produces a new version number, never a same-version
update.

- [ ] **Step 1: Add `saveDocumentEditAction` and `markDocumentSentAction` to `app/(app)/jobs/[slug]/document-actions.ts`**

No dedicated unit test file, same reasoning as Task 12's `pasteDocumentAction`: both are thin wrappers
over already-tested `lib/artifacts` functions. Task 14's `documents.spec.ts` exercises both through
the browser (edit with Write and Preview, save, mark as sent, edit again to get version 3).

Add these imports to the top of the file, alongside Task 12's:

```typescript
import { saveArtifactEdit } from "@/lib/artifacts/edit";
import { markArtifactSent } from "@/lib/artifacts/sent";
import { editFormSchema, type EditFormState } from "@/lib/artifacts/forms";
import { KEY_PATTERN } from "@/lib/bridge/wire";
```

Append these exports (Task 12's `pasteDocumentAction` and the shared `revalidateDocuments` helper it
defines are unchanged and reused here, not redefined):

```typescript
export async function saveDocumentEditAction(
  opportunityId: string,
  key: string,
  _prev: EditFormState,
  formData: FormData,
): Promise<EditFormState> {
  const user = await requireUser();
  const idParsed = z.uuid().safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  if (!KEY_PATTERN.test(key)) {
    return { ok: false, code: "artifact_not_found", message: messageFor("artifact_not_found") };
  }
  const fieldsParsed = editFormSchema.safeParse({ bodyMd: formData.get("bodyMd") });
  if (!fieldsParsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: messageFor("invalid"),
      fieldErrors: fieldErrorsFromZod(fieldsParsed.error),
    };
  }
  const s = scopedFor(user.id);
  // Documents are never company-scoped (no sendable kind can be shared
  // across a company's jobs), so the ref this action edits is always
  // opportunity scope - there is no separate "which scope" decision to
  // make here the way pasteDocumentAction has to make from its own
  // PasteTarget.
  const result = await saveArtifactEdit(s, opportunityId, { scope: "opportunity", key }, fieldsParsed.data.bodyMd);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateDocuments(s, opportunityId, "opportunity");
  return { ok: true, data: result.data };
}

export async function markDocumentSentAction(
  opportunityId: string,
  key: string,
  version: number,
): Promise<Result<null, string>> {
  const user = await requireUser();
  const idParsed = z.uuid().safeParse(opportunityId);
  if (!idParsed.success) return fail("not_found", messageFor("not_found"));
  if (!KEY_PATTERN.test(key)) return fail("artifact_not_found", messageFor("artifact_not_found"));
  const s = scopedFor(user.id);
  const result = await markArtifactSent(s, opportunityId, key, version);
  if (!result.ok) return fail(result.code, messageFor(result.code));
  await revalidateDocuments(s, opportunityId, "opportunity");
  return { ok: true, data: null };
}
```

- [ ] **Step 2: Update `components/job/job-tabs.tsx` in full**

```tsx
"use client";

import { useRouter } from "next/navigation";

import { DetailTabs, type DetailTabItem } from "@/components/super-ai/detail-tabs";

export type JobTabId = "overview" | "research" | "people" | "documents" | "timeline" | "prep";

const TAB_ITEMS: DetailTabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "research", label: "Research" },
  { id: "people", label: "People" },
  { id: "documents", label: "Documents" },
  { id: "timeline", label: "Timeline" },
  { id: "prep", label: "Prep" },
];

export function JobTabs({ activeTab, basePath }: { activeTab: JobTabId; basePath: string }) {
  const router = useRouter();

  return (
    <DetailTabs
      items={TAB_ITEMS}
      activeId={activeTab}
      onSelect={(id) => router.push(`${basePath}?tab=${id}`, { scroll: false })}
      ariaLabel="Job sections"
      className="flex-wrap"
    />
  );
}
```

- [ ] **Step 3: Update `app/(app)/jobs/[slug]/page.tsx` in full**

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { getJobView } from "@/lib/pipeline/read";
import { toOpportunityState, stageControlsFor } from "@/lib/pipeline/stage-controls";
import { parseDocRef } from "@/lib/artifacts/tabs";
import { JobHeader } from "@/components/job/job-header";
import { StageStepper } from "@/components/job/stage-stepper";
import { NextActionBar } from "@/components/job/next-action-bar";
import { JobTabs, type JobTabId } from "@/components/job/job-tabs";
import { TabOverview } from "@/components/job/tab-overview";
import { TabResearch } from "@/components/job/tab-research";
import { TabPeople } from "@/components/job/tab-people";
import { TabDocuments } from "@/components/job/tab-documents";
import { TabTimeline } from "@/components/job/tab-timeline";
import { TabPrep } from "@/components/job/tab-prep";

const TAB_IDS: readonly JobTabId[] = ["overview", "research", "people", "documents", "timeline", "prep"];

function resolveTab(value: string | string[] | undefined): JobTabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value) ? (value as JobTabId) : "overview";
}

function resolveVersion(value: string | string[] | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

export default async function JobPage(props: PageProps<"/jobs/[slug]">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const s = scopedFor(user.id);
  const view = await getJobView(s, slug);
  if (!view) {
    notFound();
  }

  const state = toOpportunityState(view);
  const controls = stageControlsFor(state, new Date());
  const tab = resolveTab(searchParams.tab);
  const docRef = parseDocRef(searchParams.doc);
  const version = resolveVersion(searchParams.v);
  const stageOptions = view.stages.map((stage) => ({ id: stage.id, label: stage.label }));
  const basePath = `/jobs/${slug}`;

  return (
    <div className="flex flex-col gap-6 p-6">
      <JobHeader opportunity={view.opportunity} companyName={view.company.name} />
      <StageStepper
        opportunity={view.opportunity}
        companyName={view.company.name}
        stages={view.stages}
        currentStageId={view.opportunity.currentStageId!}
        controls={controls}
      />
      <NextActionBar opportunity={view.opportunity} />
      <div>
        <JobTabs activeTab={tab} basePath={basePath} />
        {tab === "overview" && (
          <TabOverview opportunity={view.opportunity} company={view.company} opportunityId={view.opportunity.id} />
        )}
        {tab === "research" && (
          <TabResearch
            s={s}
            opportunityId={view.opportunity.id}
            companyId={view.company.id}
            companyName={view.company.name}
            jobDocuments={view.documents}
            docRef={docRef}
            basePath={basePath}
            stages={stageOptions}
          />
        )}
        {tab === "people" && (
          <TabPeople opportunityId={view.opportunity.id} stages={stageOptions} people={view.people} />
        )}
        {tab === "documents" && (
          <TabDocuments
            s={s}
            opportunityId={view.opportunity.id}
            companyId={view.company.id}
            jobDocuments={view.documents}
            docRef={docRef}
            version={version}
            basePath={basePath}
            stages={stageOptions}
          />
        )}
        {tab === "timeline" && <TabTimeline opportunityId={view.opportunity.id} events={view.events} />}
        {tab === "prep" && (
          <TabPrep
            s={s}
            opportunityId={view.opportunity.id}
            companyId={view.company.id}
            jobDocuments={view.documents}
            docRef={docRef}
            basePath={basePath}
            stages={view.stages}
            slug={slug}
          />
        )}
      </div>
    </div>
  );
}
```

`TabDocuments` gets `companyId` for the same structural reason `TabResearch`/`TabPrep` do: `getDocument`'s
`context` parameter always takes both `opportunityId` and `companyId`, even though a Documents ref is
always opportunity-scoped and never actually reads the latter.

- [ ] **Step 4: Build `components/job/tab-documents.tsx`**

Server component, `async function` (fetches the one selected document's full body and its version
history itself, the same reasoning `tab-research.tsx` and `tab-prep.tsx` give).

```typescript
export async function TabDocuments(props: {
  s: Scoped;
  opportunityId: string;
  companyId: string;
  jobDocuments: ArtifactMeta[];
  docRef: DocRef | null;
  version: number | undefined;
  basePath: string;
  stages: { id: string; label: string }[];
}): Promise<React.ReactElement>;
```

Body:
1. `const docsList = docsForTab(props.jobDocuments, "documents");`
2. `const groups: DocGroup[] = [{ id: "documents", heading: "", docs: docsList }];` - one group with
   an empty `heading`, so `DocumentList` renders no group heading here (a flat list), unlike Research
   and Prep's own headed groups.
3. `const selected = selectDoc(groups, props.docRef);`
4. `<section aria-label="Documents" className="flex flex-col gap-4 py-4">`
   - A header row: `<PasteDialogTrigger opportunityId={props.opportunityId} target={{ mode: "new" }} defaultKind={DEFAULT_KIND_FOR_TAB.documents} stages={props.stages} label="Paste markdown" />`.
   - `selected === null`: `<EmptyState size="panel" title="No documents yet." description="Push a CV, cover letter or message from the command line, or paste markdown." />`
   - Otherwise:
     - `const doc = (await getDocument(props.s, { opportunityId: props.opportunityId, companyId: props.companyId }, { scope: "opportunity", key: selected.key }, props.version))!;`
     - `const isLatest = doc.current.version === doc.latestVersion;`
     - `const stageLabel = props.stages.find((st) => st.id === doc.current.stageId)?.label ?? null;`
     - `const sendable = kindInfo(doc.current.kind).sendable;`
     - A two-part layout matching Research and Prep's own (`flex flex-col gap-6 md:flex-row
       md:items-start`, list at `md:w-64 md:shrink-0`, document column at `min-w-0 md:flex-1`):
       - `<DocumentList label="Documents list" groups={groups} selected={props.docRef} basePath={props.basePath} tab="documents" />`
       - In the document column: when `!isLatest`, a banner above `DocumentView` -
         `<p role="status" className="text-sm text-muted-foreground">{doc.current.sentAt ? "This version was sent and stays read-only." : `You are viewing version ${doc.current.version}. The latest is version ${doc.latestVersion}.`}</p>` followed by `<Link href={`${props.basePath}?tab=documents&doc=${formatDocRef({ scope: "opportunity", key: selected.key })}`}>Open the latest version</Link>` (dropping `v` entirely falls back to the latest, `selectDoc`/`getDocument`'s own default).
       - `<DocumentView doc={doc.current} companyName={null} stageLabel={stageLabel} actions={<>
           <PasteDialogTrigger opportunityId={props.opportunityId} target={{ mode: "version", scope: "opportunity", key: selected.key }} defaultKind={doc.current.kind} stages={props.stages} initial={{ title: doc.current.title, kind: doc.current.kind, stageId: doc.current.stageId }} label="Paste a new version" ariaLabel={`Paste a new version of ${doc.current.title}`} />
           {sendable && !doc.current.sentAt ? <MarkSentDialogTrigger opportunityId={props.opportunityId} documentKey={selected.key} version={doc.current.version} title={doc.current.title} /> : null}
         </>}>
           {isLatest ? (
             <DocumentEditor
               opportunityId={props.opportunityId}
               documentKey={selected.key}
               version={doc.current.version}
               bodyMd={doc.current.bodyMd}
               renderedBody={<Markdown source={doc.current.bodyMd} headingBase={3} />}
               isSent={Boolean(doc.current.sentAt)}
               title={doc.current.title}
             />
           ) : undefined}
         </DocumentView>`
       - `<VersionList title={doc.current.title} documentKey={selected.key} basePath={props.basePath} versions={doc.versions} />` below the article.

`isLatest ? <DocumentEditor .../> : undefined` is the one line that makes "viewing an older version
hides Edit" true: when it evaluates to `undefined`, `DocumentView` receives no `children` at all and
falls back to its own default `<Markdown>` rendering, with no `Edit` button anywhere in the tree.

- [ ] **Step 5: Build `components/job/document-editor.tsx`**

Client component (`"use client"`; owns the `editing` boolean and the in-progress draft text, calls
`useActionState`).

```typescript
export function DocumentEditor(props: {
  opportunityId: string;
  documentKey: string;
  version: number;
  bodyMd: string;
  renderedBody: React.ReactNode;
  isSent: boolean;
  title: string;
}): React.ReactElement;
```

Structure and wiring:
- `const [editing, setEditing] = React.useState(false);`
- `const [mode, setMode] = React.useState<"write" | "preview">("write");`
- `const [draft, setDraft] = React.useState(props.bodyMd);`
- `const action = saveDocumentEditAction.bind(null, props.opportunityId, props.documentKey);`
- `const [state, formAction, pending] = React.useActionState<EditFormState, FormData>(action, undefined);`
- `const announce = useAnnounce();`
- `const editRef = React.useRef<HTMLButtonElement>(null);`
- Focus-back-to-Edit on leaving the editing state, the exact idiom `next-action-bar.tsx` already uses
  for its own editing toggle (an element that both opens *and* closes editing unmounts itself the
  instant it is clicked, so a naive "focus the thing that was just clicked" cannot work for the
  close side):

```tsx
const wasEditing = React.useRef(false);
React.useEffect(() => {
  if (editing) {
    wasEditing.current = true;
    return;
  }
  if (wasEditing.current) {
    wasEditing.current = false;
    editRef.current?.focus();
  }
}, [editing]);
```

- A second effect reacts to `state` (the save result): on success, announce the right sentence for
  `state.data.status` (`"edited"` -> `` `Saved ${state.data.title}.` ``; `"versioned"` -> `` `Saved
  ${state.data.title} as version ${state.data.version}.` ``; `"unchanged"` -> `No changes to save.` -
  a different sentence from the paste dialog's own unchanged text, because the two are separately
  fixed in the frame's Announcements list), then `setEditing(false)`. On failure with `state.code !==
  "invalid"` (the document or job vanished under the user - `not_found`/`artifact_not_found`), toast
  `` `Could not save the document. ${messageFor(state.code)}` `` - the frame's own fixed, title-less
  text for this one toast, unlike the paste dialog's `Could not save <title>.`; an `"invalid"` failure
  (blank body, over 1 MB) instead renders inline under the `Markdown` field through `state.fieldErrors`,
  the same split Task 12's paste dialog makes between a field problem and everything else. Neither
  outcome closes the editor when it fails, so the typed draft is untouched (this component never
  resets `draft` to `state`'s own value on any path except the explicit `Cancel` button below).
- Not editing: renders `props.renderedBody`, then a row holding `Button` `Edit` (`ref={editRef}`,
  `data-document-edit=""`, `aria-label`\`Edit ${props.title}\`, `onClick={() => { setDraft(props.bodyMd); setEditing(true); }}`).
- Editing: a `<form onSubmit={(event) => submitViaTransition(event, formAction)} className="flex flex-col gap-3">`:
  - `<ModeTabs modes={[{ value: "write", label: "Write" }, { value: "preview", label: "Preview" }]} value={mode} onValueChange={(v) => setMode(v as "write" | "preview")} label="Editor view" />` - the frame's own fixed `aria-label` (`ModeTabs`'s `label` prop *is* the group's accessible name, per its own source) and its two fixed option labels.
  - When `mode === "write"`: a `FieldRow` `Markdown` wrapping `<Textarea id={id} name="bodyMd" rows={16} className="font-mono" value={draft} onChange={(e) => setDraft(e.target.value)} aria-describedby={describedBy} aria-invalid={Boolean(state?.ok === false && state.fieldErrors?.bodyMd)} />`, with the field's `hint` set to `state?.ok === false ? state.fieldErrors?.bodyMd : undefined`.
  - When `mode === "preview"`: `<Markdown source={draft} headingBase={3} />` - a fresh client-side
    render of the live `draft` text, never `props.renderedBody` (which is frozen at the *saved*
    body): this is the one place in the whole milestone `<Markdown>` renders on the client rather
    than the server, exactly as Task 10 built it to allow.
  - `props.isSent ? <p className="text-sm text-muted-foreground">{`Version ${props.version} was sent. Saving creates version ${props.version + 1}.`}</p> : null` - the frame's own fixed sentence; `props.version + 1` is a display-only guess at the next number (the server is the real authority and returns the actual number in `state.data.version` once the save resolves, which is what the announcement above reports) - stated this way so a user considering the edit knows *before* saving that it forks, not only after.
  - `DialogFooter`-less button row (this is inline in the page, not a dialog): `Button type="submit"` `Save` (`disabled={pending}`) and `Button type="button"` `Cancel` (`onClick={() => { setDraft(props.bodyMd); setEditing(false); }}`).

Cancel makes no server call: it simply discards the draft and returns to the rendered view, the same
"no request, no toast" shape `board.tsx`'s own no-op moves use for a case that needs no server
round trip at all.

- [ ] **Step 6: Build `components/job/mark-sent-dialog.tsx`**

Client component.

```typescript
export function MarkSentDialogTrigger(props: {
  opportunityId: string;
  documentKey: string;
  version: number;
  title: string;
}): React.ReactElement;
```

Structure:
- `Button` `Mark as sent` (`aria-label`\`Mark version ${props.version} of ${props.title} as sent\`,
  `ref={triggerRef}`), `onClick` opens local `open` state.
- `Dialog`/`DialogContent`: `DialogHeader`/`DialogTitle` `Mark as sent`; text `` `Version
  ${props.version} of ${props.title} becomes read-only. Later edits start a new version.` ``;
  `DialogFooter` with `Button` `Mark as sent` (the confirm button; same visible text as the trigger,
  distinguishable by context the way `edit-stages-dialog.tsx`'s "Add stage" trigger-less section and
  its own submit button share a name too) and `Button` `Cancel` (`onClick={() => setOpen(false)}`).

Confirm handler, the same confirm-then-call shape as `RevokeTokenDialog` (Task 11) and
`board.tsx`'s `runClose`:

```tsx
const [, startTransition] = React.useTransition();
const announce = useAnnounce();

function handleConfirm() {
  startTransition(async () => {
    try {
      const result = await markDocumentSentAction(props.opportunityId, props.documentKey, props.version);
      if (!result.ok) {
        toast.error(`Could not mark ${props.title} as sent. ${messageFor(result.code)}`);
        return;
      }
      setOpen(false);
      announce(`Marked ${props.title} as sent.`);
      // The dialog is still mid closing animation right here, and the
      // trigger it will try to restore focus to - this row's own "Mark as
      // sent" button - is gone the instant the revalidated page no longer
      // shows it (a sent version is no longer unsent, so the button that
      // only shows for an unsent version disappears), the same reasoning
      // board.tsx's runClose gives for using correctFocusOnceLost instead
      // of a one-time focusWasLost() check. Edit stays available even for
      // a sent latest version (editing it starts a new version rather
      // than being blocked), so it is the first fallback; the second
      // fallback exists for the rarer case of marking an OLDER,
      // previously-unsent version as sent, where Edit itself is hidden.
      correctFocusOnceLost(() => {
        const editButton = document.querySelector<HTMLElement>("[data-document-edit]");
        if (editButton) {
          editButton.focus();
          return;
        }
        document.querySelector<HTMLElement>("[data-document-title]")?.focus();
      });
    } catch (error) {
      console.error("mark as sent failed", error);
      toast.error(`Could not mark ${props.title} as sent. ${messageFor("unexpected")}`);
    }
  });
}
```

- [ ] **Step 7: Build `components/job/version-list.tsx`**

Server component.

```typescript
export function VersionList(props: {
  title: string;
  documentKey: string;
  basePath: string;
  versions: ArtifactMeta[]; // ascending, DocumentView.versions' own contract
}): React.ReactElement;
```

Structure:
- `<h3>Versions</h3>`
- `<ol aria-label={`Versions of ${props.title}`}>`, newest first (`[...props.versions].reverse()`,
  never mutating the prop array in place):
  - `<Link href={`${props.basePath}?tab=documents&doc=${formatDocRef({ scope: "opportunity", key: props.documentKey })}&v=${version.version}`}>{`Version ${version.version}`}</Link>`
  - A meta line: `` `${ORIGIN_WORDS[version.origin]} ` `` plus `<LocalTime value={version.createdAt} mode="date" />`, then `` ` · Edited ` `` plus `<LocalTime value={version.editedAt} mode="date" />` when `version.editedAt` is set, then `` ` · Sent ` `` plus `<LocalTime value={version.sentAt} mode="date" />` when `version.sentAt` is set.
  - `const notice = versionNotice(props.versions, version.version);` rendered as its own line when
    non-null (`` `Pushed after you edited version <n>.` ``, `versionNotice`'s own fixed sentence
    from Task 3).

- [ ] **Step 8: Manual browser check**

With Tasks 1 to 12 built:

1. `pnpm dev`, sign in, open a job. Confirm the tab order is Overview, Research, People, Documents,
   Timeline, Prep, and confirm `No documents yet.` on a job with none.
2. Paste a CV (kind `CV`). Confirm it appears in the Documents list with `CV · v1` as its meta line
   and no ` · Sent` suffix. Confirm `Edit`, `Paste a new version` and `Mark as sent` all show.
3. Click `Edit`; confirm focus enters the editor, `Write`/`Preview` are both reachable, typing in
   Write and switching to Preview shows the live, unsaved text rendered as markdown (not the original
   saved body). Click `Cancel`; confirm the typed text is discarded, the rendered body is unchanged,
   and focus returns to `Edit`.
4. Click `Edit` again, change the body, click `Save`. Confirm the live region announced `Saved <title>.`,
   the rendered body shows the new text, focus returns to `Edit`, and the versions list still shows
   only `Version 1` (an in-place edit, not a new version, per rule 4).
5. Click `Mark as sent`; confirm the dialog names the version and title; confirm; confirm the row's
   meta line gains ` · Sent`, the live region announced `Marked <title> as sent.`, focus lands on
   `Edit` (inspect `document.activeElement`), and `Mark as sent` itself is gone from the actions row.
6. Click `Edit`, change the body, note the sent-notice sentence naming the next version number, save.
   Confirm the live region announced `Saved <title> as version 2.`, the versions list now shows
   Version 2 and Version 1, and the meta line of the current view shows `Version 2` with no `Sent`
   suffix (the sent lock stayed on version 1).
7. Click `Version 1` in the versions list. Confirm the URL gains `&v=1`, the banner reads `This
   version was sent and stays read-only.`, `Edit` and `Mark as sent` are both gone, and `Open the
   latest version` returns to version 2 with the editor back.
8. Try submitting an empty body from the editor: confirm `The document cannot be empty.` under the
   field, the editor stays open, focus stays reachable, nothing is saved.
9. At 390px wide, confirm the editor, the version list and a wide pasted table all stay within
   `window.innerWidth` with no page-level horizontal scrollbar. Run an axe scan (or the equivalent
   manual check) on the Documents tab and on the open editor in both light and dark. Repeat steps 2
   to 8 in Safari.

- [ ] **Step 9: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
```

Expected: all four exit 0. This task adds no new unit test file (Step 1's reasoning); `pnpm test`'s
count is unchanged from Task 12. Task 14 is what actually proves this task's behavior through the
browser in an automated, repeatable way.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/jobs/[slug]/document-actions.ts" "app/(app)/jobs/[slug]/page.tsx" components/job/job-tabs.tsx components/job/tab-documents.tsx components/job/document-editor.tsx components/job/mark-sent-dialog.tsx components/job/version-list.tsx
git commit -m "$(cat <<'EOF'
feat: add the Documents tab with the editor, versions and Mark as sent
EOF
)"
```

---

### Task 14: End to end and accessibility

**Files:**
- Create: `tests/e2e/session.ts`, `tests/e2e/cli.ts`, `tests/e2e/scan-in-place.ts`, `tests/e2e/bridge.spec.ts`, `tests/e2e/documents.spec.ts`, `tests/e2e/documents-phone.spec.ts`
- Modify: `playwright.config.ts`, `tests/e2e/global-setup.ts`

**Interfaces:**
- Consumes: `EMAIL`, `PASSWORD` (`tests/e2e/account.ts`, Milestone 1, unmodified). `scanForViolations` (`tests/e2e/axe.ts`, unmodified). `scanOpenOverlay` (`tests/e2e/scan-open.ts`, unmodified). Every accessible name and copy string fixed under "UI copy and accessible names" and "Messages and validation" in the frame, produced by Tasks 10 to 13. `cli/dist/jobsmith.mjs` and `pnpm cli:build` (Task 9). `tests/fixtures/packet/` and its fixed H1 titles (Task 9). The three bridge routes (Task 7), reached only through the built CLI here, never called directly by a spec.
- Produces: `pnpm test:e2e` extended with three new spec files, running against widened `chromium`/`webkit`/`phone` projects. New shared e2e helpers other specs may reuse in a later milestone: `login(page)`, `uniqueName(testInfo, base)`, `addJobAndOpen(page, company, role): Promise<string>` from `tests/e2e/session.ts`; `runCli(args, options): Promise<{ code; stdout; stderr }>` from `tests/e2e/cli.ts`; `scanInPlace(page, label, testInfo): Promise<void>` from `tests/e2e/scan-in-place.ts`.

**Why three scan helpers, not one.** `scanForViolations` (Milestone 1) reloads the page, so it only
ever fits a real URL. `scanOpenOverlay` (Milestone 2) skips the reload and scopes the axe run to
`[role="dialog"]`, for a Base UI dialog or sheet whose open/closed state is local component state a
reload would destroy. Documents' own inline editor is a third shape neither covers: like a dialog, its
open/editing state is local and a reload would close it; unlike a dialog, it is not an overlay sitting
on top of an otherwise-inert page, so scoping the scan to a dialog role would simply find nothing.
`scan-in-place.ts` reuses the same color-scheme loop, `matchMedia` wait and animation-settle wait as
the other two, over the *whole* page, with no reload and no role scope.

**This task does not touch `pipeline.spec.ts`, `job-page.spec.ts` or `pipeline-phone.spec.ts`.** Each
of those Milestone 2 files still carries its own local `login`/`uniqueName`/`addJobAndOpen` copies.
`tests/e2e/session.ts` is new shared code for the *new* files this task adds; consolidating the
Milestone 2 files onto it is a worthwhile follow-up but out of this task's own file list (the frame
lists only new files for Task 14, not a Milestone 2 refactor), and touching a passing Milestone 2 spec
file for a pure internal refactor is exactly the kind of unrequested scope creep the milestone's own
"one reviewer gate per task" discipline exists to avoid.

- [ ] **Step 1: Update `tests/e2e/global-setup.ts` in full**

```typescript
async function globalSetup() {
  process.env.ALLOW_DB_RESET = "true";
  const { execSync } = await import("node:child_process");
  execSync("pnpm reset-db", { stdio: "inherit" });
  execSync("pnpm cli:build", { stdio: "inherit" });
}

export default globalSetup;
```

Building the CLI once here, before any project starts, means every spec that spawns it (`bridge.spec.ts`
on both `chromium` and `webkit`, concurrently) reads the same already-built, read-only
`cli/dist/jobsmith.mjs` rather than each racing to rebuild it.

- [ ] **Step 2: Update `playwright.config.ts` in full**

```typescript
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      // Runs once, on the freshly reset database, and creates the only account.
      // No retries: a second attempt would find the account already there.
      name: "first-run",
      testMatch: /first-run\.spec\.ts/,
      retries: 0,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testMatch: /(shell|pipeline|job-page|documents|bridge)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      testMatch: /(shell|pipeline|job-page|documents|bridge)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "phone",
      testMatch: /(shell|pipeline-phone|documents-phone)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    // All browsers log in from the same address, so the suite raises the
    // sign-in limit for the server it starts. The default stays 5 per
    // minute. SETUP_TOKEN matches the constant in tests/e2e/account.ts, so
    // first-run.spec.ts can exercise both a missing and a wrong token
    // before using the right one to create the only account.
    command:
      "pnpm build && SETUP_TOKEN=e2e-setup-token-0123456789 AUTH_SIGNIN_MAX_PER_MINUTE=1000 pnpm start",
    url: baseURL,
    // Never reuse a server already listening on baseURL: it would be
    // whatever `pnpm dev` or a stale `pnpm start` happens to have running,
    // built without this suite's SETUP_TOKEN and AUTH_SIGNIN_MAX_PER_MINUTE,
    // which would then fail in confusing ways rather than at startup.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
```

`documents-phone.spec.ts` does not also satisfy `chromium`/`webkit`'s own regex: after the engine
consumes the literal word `documents`, that alternative's own `\.spec\.ts$` demands the very next
characters be `.spec.ts` to the end of the string, and in `documents-phone.spec.ts` `-phone.spec.ts`
follows instead - the same reasoning Milestone 2's own `pipeline`/`pipeline-phone` split already
relies on, extended to a second pair of names.

- [ ] **Step 3: Write `tests/e2e/session.ts`**

```typescript
import { expect, type Page, type TestInfo } from "@playwright/test";
import { EMAIL, PASSWORD } from "./account";

export function uniqueName(testInfo: TestInfo, base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base} ${testInfo.project.name} ${suffix}`;
}

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);
}

export async function addJobAndOpen(page: Page, company: string, role: string): Promise<string> {
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Company").fill(company);
  await dialog.getByLabel("Role").fill(role);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("link", { name: `${role} at ${company}` }).click();
  await expect(page).toHaveURL(/\/jobs\//);

  const slug = new URL(page.url()).pathname.split("/").filter(Boolean).pop();
  if (!slug) {
    throw new Error(`addJobAndOpen: could not read a slug from ${page.url()}`);
  }
  return slug;
}
```

- [ ] **Step 4: Write `tests/e2e/cli.ts`**

```typescript
import { spawn } from "node:child_process";
import path from "node:path";

export function runCli(
  args: string[],
  options: { configHome: string; input?: string },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, XDG_CONFIG_HOME: options.configHome };
    // Never let a developer's own local login leak into a test run: every
    // spec that spawns the CLI expects to start from a clean, per-test
    // config directory it fully controls.
    delete env.JOBSMITH_URL;
    delete env.JOBSMITH_TOKEN;

    const child = spawn(process.execPath, [path.join(process.cwd(), "cli/dist/jobsmith.mjs"), ...args], {
      env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));

    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}
```

`process.cwd()` is the repo root here, the same assumption `global-setup.ts`'s own `pnpm cli:build`/
`pnpm reset-db` calls already make; `--dir`/`--out` arguments passed as relative paths (`"tests/fixtures/packet"`)
resolve against this same cwd, per D31/D32.

- [ ] **Step 5: Write `tests/e2e/scan-in-place.ts`**

```typescript
import { expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Scans the whole current page in both color schemes with no reload, for
 * content driven by local component state a reload would lose - the
 * Documents editor's own open/editing state (document-editor.tsx's own
 * useState), which is neither a real URL (scanForViolations' target) nor an
 * overlay sitting on top of an otherwise-inert page (scanOpenOverlay's
 * target, which is why that helper scopes its scan to `[role="dialog"]`).
 * The editor is inline content with nothing behind it to exclude, so this
 * scans the entire page, and needs no "reopen" callback: nothing here ever
 * closes on its own the way a dialog's exit animation can undo a caller's
 * assumption that it is still open.
 */
export async function scanInPlace(page: Page, label: string, testInfo: TestInfo) {
  const slug = slugify(label);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.waitForFunction(
      (scheme) => window.matchMedia(`(prefers-color-scheme: ${scheme})`).matches,
      colorScheme,
    );
    await page.waitForFunction(
      (scheme) => document.documentElement.classList.contains(scheme),
      colorScheme,
    );
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

    await page.screenshot({
      path: `test-results/screens/${testInfo.project.name}-${slug}-${colorScheme}.png`,
      fullPage: true,
    });

    const results = await new AxeBuilder({ page }).analyze();
    for (const violation of results.violations) {
      console.log(`[${label} / ${colorScheme}] ${violation.id} (${violation.impact}): ${violation.help}`);
      for (const node of violation.nodes) {
        console.log(`  target: ${node.target.join(", ")}`);
        console.log(`  summary: ${node.failureSummary}`);
      }
    }
    expect(results.violations, `${label} (${colorScheme}) axe violations`).toEqual([]);
  }
}
```

- [ ] **Step 6: Write `tests/e2e/bridge.spec.ts`**

Covers D37's whole acceptance path (create a token, `login`, `push`, a second `push`, `pull`, read the
documents back in the app, exactly one `Documents updated.` despite two pushes) plus revoke-then-`list`
exits 1, and axe on `/settings`, the create-token reveal state, the revoke dialog, and Research,
Documents and Prep once they hold real pushed documents.

```typescript
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { login, uniqueName, addJobAndOpen } from "./session";
import { runCli } from "./cli";

async function createToken(page: Page, name: string): Promise<string> {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Create token" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a token" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Create token" }).click();
  await expect(dialog.getByText("Give the token a name.")).toBeVisible();
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create token" }).click();
  const revealDialog = page.getByRole("dialog", { name: "Copy your new token" });
  await expect(revealDialog).toBeVisible();
  await expect(page.getByLabel("Your new token")).toBeFocused();
  const token = await page.getByLabel("Your new token").inputValue();
  await page.getByRole("button", { name: "Done" }).click();
  return token;
}

test("the CLI pushes a real packet, a second push changes nothing, the app reads it back, and a revoked token is refused", async ({
  page,
}, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Northwind Labs");
  const role = "Design Lead";
  const slug = await addJobAndOpen(page, company, role);
  const origin = new URL(page.url()).origin;
  const tokenName = uniqueName(testInfo, "CLI");

  const token = await test.step("create a token in Settings", () => createToken(page, tokenName));

  const configHome = testInfo.outputPath("cli-config");

  await test.step("jobsmith login saves the URL and token", async () => {
    const result = await runCli(["login", "--url", origin], { configHome, input: `${token}\n` });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Logged in to ${origin}.`);
  });

  await test.step("the first push creates every document, with the debrief's one stage warning", async () => {
    const result = await runCli(["push", slug, "--dir", "tests/fixtures/packet", "--prefix", "nwl"], { configHome });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("11 created, 0 versioned, 0 updated, 0 unchanged.");
    expect(result.stdout).toContain("Warning:");
  });

  await test.step("a second, identical push reports every document unchanged", async () => {
    const result = await runCli(["push", slug, "--dir", "tests/fixtures/packet", "--prefix", "nwl"], { configHome });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("0 created, 0 versioned, 0 updated, 11 unchanged.");
  });

  await test.step("pull writes the context document for this job", async () => {
    const outDir = testInfo.outputPath("pull-out");
    const result = await runCli(["pull", slug, "--out", outDir], { configHome });
    expect(result.code).toBe(0);
    const written = path.join(outDir, `${slug}-context.md`);
    expect(result.stdout).toContain(`Wrote ${written}.`);
    const content = fs.readFileSync(written, "utf8");
    expect(content).toContain("jobsmith: context/v1");
    expect(content).toContain(company);
  });

  await test.step("exactly one Documents updated. event despite two pushes", async () => {
    await page.goto(`/jobs/${slug}?tab=timeline`);
    await expect(page.getByText("Documents updated.")).toHaveCount(1);
  });

  await test.step("Research, Documents and Prep show the pushed documents, with axe on each", async () => {
    await page.goto(`/jobs/${slug}?tab=research`);
    await expect(page.getByRole("link", { name: "Northwind Labs: fit brief" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: people in the loop" })).toBeVisible();
    await expect(page.getByRole("heading", { name: `Shared with every job at ${company}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: company recon" })).toBeVisible();
    await scanForViolations(page, "research tab with documents", testInfo);

    await page.goto(`/jobs/${slug}?tab=documents`);
    await expect(page.getByRole("link", { name: "CV for Northwind Labs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cover letter for Northwind Labs" })).toBeVisible();
    await scanForViolations(page, "documents tab with documents", testInfo);

    await page.goto(`/jobs/${slug}?tab=prep`);
    await expect(page.getByRole("heading", { name: "Recruiter screen" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hiring manager" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: full answers" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: recruiter screen questions" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: hiring manager call card" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Portfolio walkthrough pitch" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: round two debrief" })).toBeVisible();
    await scanForViolations(page, "prep tab with documents", testInfo);
  });

  await test.step("axe on the create-token reveal state and the revoke dialog, using a disposable second token", async () => {
    await page.goto("/settings");
    const scratchName = uniqueName(testInfo, "Axe scratch token");
    await page.getByRole("button", { name: "Create token" }).click();
    const createDialog = page.getByRole("dialog", { name: "Create a token" });
    await createDialog.getByLabel("Name").fill(scratchName);
    await createDialog.getByRole("button", { name: "Create token" }).click();
    const revealDialog = page.getByRole("dialog", { name: "Copy your new token" });
    await expect(revealDialog).toBeVisible();
    await scanOpenOverlay(page, "create token reveal state", testInfo, async () => {
      await expect(revealDialog).toBeVisible();
    });
    await page.getByRole("button", { name: "Done" }).click();

    await page.getByRole("button", { name: `Revoke ${scratchName}` }).click();
    const revokeDialog = page.getByRole("dialog", { name: "Revoke this token" });
    await expect(revokeDialog).toBeVisible();
    await scanOpenOverlay(page, "revoke token dialog", testInfo, async () => {
      if (!(await revokeDialog.isVisible())) {
        await page.getByRole("button", { name: `Revoke ${scratchName}` }).click();
      }
      await expect(revokeDialog).toBeVisible();
    });
    await revokeDialog.getByRole("button", { name: "Revoke token" }).click();
    await expect(revokeDialog).toBeHidden();
  });

  await test.step("revoking the CLI's own token makes list exit 1 with the refused-token line", async () => {
    await page.goto("/settings");
    await page.getByRole("button", { name: `Revoke ${tokenName}` }).click();
    const dialog = page.getByRole("dialog", { name: "Revoke this token" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Revoke token" }).click();
    await expect(dialog).toBeHidden();

    const result = await runCli(["list"], { configHome });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "The server refused the token. Create a new one in Settings and run jobsmith login.",
    );
  });
});
```

- [ ] **Step 7: Write `tests/e2e/documents.spec.ts`**

Covers: paste a CV (rejecting a blank title first), paste a second version through "Paste a new
version" and confirm the older, never-sent version's own banner (and that Mark as sent stays available
on it), edit it with Write and Preview (rejecting an emptied body first), save, mark it as sent through
the dialog, see the sent state, edit the sent latest again and get version 3; axe on the paste dialog,
the mark as sent dialog and the open editor.

```typescript
import { test, expect, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { scanInPlace } from "./scan-in-place";
import { login, uniqueName, addJobAndOpen } from "./session";

test("paste a CV, paste a second version, edit it with Write and Preview, mark it as sent, and edit again for version 3", async ({
  page,
}, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Lumen Health");
  const role = "Staff Product Designer";
  const slug = await addJobAndOpen(page, company, role);
  const title = uniqueName(testInfo, "CV");

  await page.goto(`/jobs/${slug}?tab=documents`);
  await expect(page.getByText("No documents yet.")).toBeVisible();
  await scanForViolations(page, "empty documents tab", testInfo);

  await test.step("paste a CV", async () => {
    await page.getByRole("button", { name: "Paste markdown" }).click();
    const dialog = page.getByRole("dialog", { name: "Paste markdown" });
    await expect(dialog).toBeVisible();

    await scanOpenOverlay(page, "paste dialog", testInfo, async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Paste markdown" }).click();
      }
      await expect(dialog).toBeVisible();
    });

    const markdown = `# ${title}\n\nLed a design system used by four product teams.`;
    await dialog.getByLabel("Markdown").fill(markdown);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Give the document a title.")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Markdown")).toHaveValue(markdown);

    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Saved ${title}.`)).toBeAttached();
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });

  await test.step("an older, never-sent version shows its own banner, not the sent one", async () => {
    const pasteNewVersionButton = page.getByRole("button", { name: `Paste a new version of ${title}` });
    await expect(pasteNewVersionButton).toBeVisible();
    await pasteNewVersionButton.click();
    const dialog = page.getByRole("dialog", { name: "Paste a new version" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Markdown").fill(`# ${title}\n\nA revised pass at the CV, pasted as a second version.`);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Saved ${title} as version 2.`)).toBeAttached();

    await page.getByRole("link", { name: "Version 1" }).click();
    await expect(page).toHaveURL(/&v=1$/);
    await expect(page.getByText("You are viewing version 1. The latest is version 2.")).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${title}` })).toBeHidden();
    await expect(page.getByRole("button", { name: "Mark as sent" })).toBeVisible();

    await page.getByRole("link", { name: "Open the latest version" }).click();
    await expect(page).not.toHaveURL(/&v=1$/);
  });

  const article = page.getByRole("article", { name: title });

  await test.step("edit it in Write and Preview, then save", async () => {
    await page.getByRole("button", { name: `Edit ${title}` }).click();
    await scanInPlace(page, "documents editor open", testInfo);

    await page.getByLabel("Markdown").fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("The document cannot be empty.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();

    await page.getByLabel("Markdown").fill(
      `# ${title}\n\nLed a design system used by four product teams.\n\nShipped it across three platforms.`,
    );
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(article.getByText("Shipped it across three platforms.")).toBeVisible();
    await page.getByRole("button", { name: "Write" }).click();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(`Saved ${title}.`)).toBeAttached();
    await expect(page.getByRole("button", { name: `Edit ${title}` })).toBeFocused();
    await expect(article.getByText("Shipped it across three platforms.")).toBeVisible();
  });

  await test.step("mark it as sent", async () => {
    await page.getByRole("button", { name: "Mark as sent" }).click();
    const dialog = page.getByRole("dialog", { name: "Mark as sent" });
    await expect(dialog).toBeVisible();

    await scanOpenOverlay(page, "mark as sent dialog", testInfo, async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Mark as sent" }).click();
      }
      await expect(dialog).toBeVisible();
    });

    await dialog.getByRole("button", { name: "Mark as sent" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Marked ${title} as sent.`)).toBeAttached();
    await expect(article.getByText(/^Sent /)).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as sent" })).toBeHidden();
    await expect(page.getByRole("button", { name: `Edit ${title}` })).toBeFocused();
  });

  await test.step("editing the sent latest version again forks version 3", async () => {
    await page.getByRole("button", { name: `Edit ${title}` }).click();
    await expect(page.getByText("Version 2 was sent. Saving creates version 3.")).toBeVisible();
    await page.getByLabel("Markdown").fill(
      `# ${title}\n\nLed a design system used by four product teams.\n\nNow with a third version.`,
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(`Saved ${title} as version 3.`)).toBeAttached();
    await expect(page.getByRole("link", { name: "Version 3" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Version 2" })).toBeVisible();
    await expect(article.getByText(/^Sent /)).toBeHidden(); // the lock stayed on version 2, not the new latest
  });

  await test.step("version 2 opens read-only, with Edit and Mark as sent both gone", async () => {
    await page.getByRole("link", { name: "Version 2" }).click();
    await expect(page).toHaveURL(/&v=2$/);
    await expect(page.getByText("This version was sent and stays read-only.")).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${title}` })).toBeHidden();
    await expect(page.getByRole("button", { name: "Mark as sent" })).toBeHidden();
    await page.getByRole("link", { name: "Open the latest version" }).click();
    await expect(page).not.toHaveURL(/&v=2$/);
  });
});
```

- [ ] **Step 8: Write `tests/e2e/documents-phone.spec.ts`**

Covers: paste on a phone, the tab strip wrapping to a second row, and no page-level horizontal
overflow on Prep or Documents.

```typescript
import { test, expect, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { login, uniqueName, addJobAndOpen } from "./session";

test("phone: paste a document, the tab strip wraps, and neither Prep nor Documents overflows", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "phone board only; playwright.config.ts also restricts this file to the phone project",
  );

  await login(page);
  const company = uniqueName(testInfo, "Acme Robotics");
  const role = "Product Designer";
  await addJobAndOpen(page, company, role);
  const title = uniqueName(testInfo, "Pitch");

  await page.getByRole("tab", { name: "Prep" }).click();
  await page.waitForURL(/tab=prep/);

  // Six tabs at 390px should wrap to a second row instead of forcing the
  // page wider - checked by position (Prep sits below Overview), which the
  // scrollWidth check further down cannot show by itself (a tab strip that
  // silently clipped instead of wrapping would still pass that check).
  const overviewBox = await page.getByRole("tab", { name: "Overview" }).boundingBox();
  const prepBox = await page.getByRole("tab", { name: "Prep" }).boundingBox();
  if (!overviewBox || !prepBox) {
    throw new Error("could not measure the job page tab strip");
  }
  expect(prepBox.y).toBeGreaterThan(overviewBox.y);

  await page.getByRole("button", { name: "Paste markdown" }).click();
  const dialog = page.getByRole("dialog", { name: "Paste markdown" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Markdown").fill(`# ${title}\n\nA short pitch pasted from a phone.`);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
  await scanForViolations(page, "phone prep tab", testInfo);

  await page.getByRole("tab", { name: "Documents" }).click();
  await page.waitForURL(/tab=documents/);
  await expect(page.getByText("No documents yet.")).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
  await scanForViolations(page, "phone documents tab", testInfo);
});
```

Unlike `bridge.spec.ts` and `documents.spec.ts`, this spec never needs the job's own slug (no CLI
call, no direct navigation by URL - every step here reaches its target by clicking through the UI
that is already on screen after `addJobAndOpen`), so its return value is simply never captured into a
variable.

- [ ] **Step 9: Manually run all three new specs before touching anything CI depends on**

```bash
pnpm exec playwright test bridge.spec.ts --project=chromium
pnpm exec playwright test documents.spec.ts --project=chromium
pnpm exec playwright test documents-phone.spec.ts --project=phone
```

Expected: each passes on its own (`playwright test <file>` matches by filename regardless of
`testMatch`, so this checks the specs before Step 2's config change wires them into the normal
`pnpm test:e2e` run). Then repeat the first two against `--project=webkit`.

- [ ] **Step 10: Run the full end-to-end suite**

```bash
pnpm test:e2e
```

Expected: `first-run` runs its own tests, then `chromium`, `webkit` and `phone` run in parallel.
`chromium`/`webkit` each now also run `bridge.spec.ts` and `documents.spec.ts` in addition to
Milestone 2's `shell.spec.ts`, `pipeline.spec.ts` and `job-page.spec.ts`; `phone` also runs
`documents-phone.spec.ts` alongside `shell.spec.ts` and `pipeline-phone.spec.ts`. All green.
Screenshots land under `test-results/screens/`; spot check a few of the new ones in both `-light` and
`-dark`, including at least one from `scan-in-place.ts`'s own output (the Documents editor).

- [ ] **Step 11: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all six exit 0.

- [ ] **Step 12: Manual browser check**

Run the acceptance path once as a human, not just through Playwright's engines: build the CLI
(`pnpm cli:build`), create a token in Settings, `jobsmith login` against a locally running instance,
push a small folder of your own fictional markdown files, confirm it shows up correctly across
Research, Documents and Prep, edit a document, mark one as sent, and push the same folder again to
confirm nothing changes. Do this once in Chrome and once in Safari.

- [ ] **Step 13: Commit**

```bash
git add playwright.config.ts tests/e2e/global-setup.ts tests/e2e/session.ts tests/e2e/cli.ts tests/e2e/scan-in-place.ts tests/e2e/bridge.spec.ts tests/e2e/documents.spec.ts tests/e2e/documents-phone.spec.ts
git commit -m "$(cat <<'EOF'
test: add end-to-end coverage for the bridge, CLI and Documents editor
EOF
)"
```

---

### Task 15: Docs and ship

**Files:**
- Create: `.gitleaks.toml`
- Modify: `README.md`, `docs/design-system.md`, `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`

**Interfaces:**
- Consumes: the whole milestone's shipped surface (Tasks 1 to 14), read as a user, a self-hoster or a
  reviewer would, not imported as code.
- Produces: an updated `README.md`, `docs/design-system.md` and spec, a `.gitleaks.toml`, and (this
  task's own final step only) the owner's first real push into their own instance. Nothing here is
  consumed by anything later; this is the milestone's last gate.

This task has no unit of executable logic of its own - it edits three documents, adds one config
file, and, in its last step, the owner acts once outside any of this. Steps are still numbered and
checked off the same way, but there is no test-first pass and no new source file.

- [ ] **Step 1: Write the README's "Documents and the command line" section**

Insert into `README.md` a new `## Documents and the command line` section, placed directly after
"Keyboard shortcuts on the board" and before "Deploying": the natural next thing to explain once a
reader knows how to add and move a job, ahead of the more operational sections.

```markdown
## Documents and the command line

Every document on a job's Research, Documents and Prep tabs is markdown, and the `jobsmith` command
line is the way to get a whole folder of it in, and a fresh copy of a job's own context out, without
opening the app.

Build it once from the repo, then install it globally:

```bash
pnpm cli:build
npm install -g ./cli
```

`pnpm cli:build` bundles `cli/src` into one dependency-free file, `cli/dist/jobsmith.mjs` (Node 20 or
newer); `npm install -g ./cli` links the `jobsmith` command from `cli/package.json`'s own `bin` entry.
There is no published package yet - reinstall the same way after pulling a newer commit.

`jobsmith login --url <base-url>` asks for a token (paste it; it is read from standard input and
never echoed on a real terminal) and saves both to `~/.config/jobsmith/config.json` (or
`$XDG_CONFIG_HOME/jobsmith/config.json`, owner-only permissions). Create a token first, in Settings.

`jobsmith list` prints your active jobs and their slugs.

`jobsmith pull <slug> [--out <dir>]` writes `<slug>-context.md`: the posting, stages, people, a
preferences summary and an index of existing documents, as one markdown file with frontmatter.

`jobsmith push <slug> [--dir <dir>] [--prefix <file-prefix>] [--dry-run]` reads every
`<prefix>-*.md` file in `--dir` (default the current directory; the prefix defaults to the slug),
skips anything that looks like a document already pulled from this app, and uploads the rest. For
each file:

- The **key** is the file name with the prefix and `.md` removed, lowercased.
- **Kind**, **stage**, **title** and **scope** come from the file's own frontmatter first
  (`kind: cv`, `stage: Hiring manager`, `title: ...`, `scope: company`), then from a suffix map -
  built in for the common names, or overridden per content folder by a `jobsmith.config.json` next
  to the files:

  ```json
  { "suffixes": { "call-card": { "stage": "Hiring manager" } } }
  ```

  A suffix with no match anywhere is still pushed, as kind `other`, with a note. Frontmatter is
  stripped before upload either way.
- A file over 1 MiB stops the push before anything is sent; a push holds at most 50 documents and 4
  MB in total, and the CLI splits a larger folder into more than one request on its own.

`--dry-run` asks the server what would happen and prints it without saving anything. Pushing the
same folder twice is always safe: unchanged content reports `unchanged` and changes nothing.

Credentials live in a different file from the suffix map on purpose: one is per machine
(`~/.config/jobsmith/config.json`), the other is per content folder (`jobsmith.config.json`, next to
the markdown files themselves, so a folder synced between machines carries its own mapping with it).
```

- [ ] **Step 2: Write the README's "API" section**

Insert directly after "Documents and the command line":

```markdown
## API

Every route below needs `Authorization: Bearer <token>`, a token created in Settings. The bridge
never accepts a session cookie, and the app's own pages never accept a bearer token - the two
authentication paths stay completely separate. Every response carries `x-request-id` and
`cache-control: no-store`; there are no CORS headers, so a browser calling this from another origin
is refused by its own preflight check before the request reaches the server at all.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/bridge/opportunities?status=active\|closed\|all` | List your jobs (slug, company, role, current stage). `status` defaults to `active`. |
| `GET` | `/api/bridge/opportunities/:slug/context` | The job's context document, as `text/markdown`. |
| `PUT` | `/api/bridge/opportunities/:slug/artifacts` | Upsert up to 50 documents; add `?dry_run=true` to preview with nothing saved. |

The push body:

```json
{
  "artifacts": [
    { "key": "cv", "kind": "cv", "title": "CV", "scope": "opportunity", "stage": "Hiring manager", "body_md": "# CV\n..." }
  ]
}
```

`title`, `scope` and `stage` are all optional (`scope` defaults to `opportunity`; a missing `stage`
leaves the document unstaged). `stage` is matched against the job's own stage labels first, then
against stage kinds, case-insensitively. Each `body_md` is capped at 1 MiB, the whole request body at
4 MB.

The response:

```json
{
  "dryRun": false,
  "results": [{ "key": "cv", "scope": "opportunity", "status": "created", "version": 1 }],
  "warnings": [],
  "requestId": "..."
}
```

`status` is one of `created`, `versioned`, `updated` or `unchanged`. A per-document problem (an
unknown kind, a stage that does not match, company scope requested for a kind that cannot share)
shows up as a warning, and the rest of the push still saves.

Every error response shares one shape, `{ "error": { "code", "message" }, "requestId" }`:

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_query` | A bad `status` or `dry_run` value |
| 400 | `invalid_json` | The body is not valid JSON |
| 400 | `invalid_payload` | The body does not match the expected shape |
| 400 | `duplicate_key` | The same key appears twice in one push |
| 401 | `unauthorized` | Missing, unknown or revoked token |
| 404 | `not_found` | No job with that slug for this token's account |
| 413 | `payload_too_large` / `too_many_artifacts` / `artifact_too_large` | Over one of the size limits |
| 429 | `rate_limited` | Over 120 requests per token per minute; `Retry-After` names the wait in seconds |
| 500 | `server_error` | Something went wrong; the message names a request id for support |
```

- [ ] **Step 3: Confirm "Adding a job" and "Keyboard shortcuts on the board" are still accurate**

Neither section describes anything this milestone touches (no field, no shortcut and no board
behavior changed), so this step is a read-through to confirm that, not a rewrite.

- [ ] **Step 4: Update `docs/design-system.md`**

No new registry item and no new `base-nova` primitive this milestone (the frame's own Tech stack
line: "No new registry items or primitives"), so the "Items installed so far" and primitives lists
need no change. Two new files have no registry or `base-nova` match at all (no registry item matches:
"the registry has a good Settings match but no good markdown-viewer... - new code, consistent with
the design system's own fallback order") and are recorded as such. Add a new section after "Local
changes":

```markdown
## New application code (no registry or primitive match)

- `components/markdown.tsx` and `components/copy-button.tsx`: hand-written, not vendored. The
  Super AI Components registry has chat/agent-output-shaped markdown renderers (`ai-doc-block`,
  `answer-block`) but nothing that is a plain sanitized GFM viewer, and no reveal-once-secret or
  copy-a-value pattern at all. Both are ordinary app code, fully subject to
  `pnpm check:tokens` (unlike `components/ui/` and `components/super-ai/`, which are excluded as
  vendored) and hand-maintained the same as any other file under `components/`.
```

Add one more bullet under the existing "Local changes" list, noting a change that was *not*
needed, so a future re-syncer does not go looking for a diff that does not exist:

```markdown
- `components/job/job-tabs.tsx` passes `className="flex-wrap"` to the vendored `DetailTabs`
  (`components/super-ai/detail-tabs.tsx`) so five and then six tabs wrap to a second row at phone
  width instead of forcing the page wider. `DetailTabs` already accepts a `className` prop
  (`DetailTabsProps.className`), so this needed no change to the vendored file itself - nothing to
  re-apply after a re-sync.
```

- [ ] **Step 5: Amend the spec, section 4 (the `api_token` table)**

In `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`, add a paragraph directly after the
existing `**api_token**` row and its following `The auth library adds...` paragraph, before `## 5.
Behavior`:

```markdown
**Milestone 3 note.** Decision D4: `api_token` also gains `rate_window_start` and `rate_count`,
not listed above when this section was first written. One `UPDATE ... RETURNING` on the token's own
row authenticates a bridge request, touches `last_used_at`, and advances the rate-window counter, all
in one atomic statement, so the limit holds across serverless instances with no separate table or
service.
```

- [ ] **Step 6: Amend the spec, section 5.2 (Research, Documents and Prep arrive)**

In the same file, section 5.2, add a paragraph directly after the existing `**Milestone 2 notes.**`
paragraph, before `### 5.3 Artifacts`:

```markdown
**Milestone 3 notes.** Decisions D23 to D26: Research, Documents and Prep (the three rows Milestone 2
left for later) are each a navigation list of document links plus one selected document rendered as
an article, chosen by a `doc` search param. Research groups a job's own documents ahead of ones
shared by every job at the same company; Prep groups by stage, with a General group for unstaged
ones; Documents adds a version list, an in-place editor with a Write/Preview toggle, and Mark as
sent. A `Paste markdown` button on each of the three tabs, and `Paste a new version` on every
document, write with origin `pasted`. The tab order is Overview, Research, People, Documents,
Timeline, Prep, and the strip wraps to a second row rather than growing the page at phone width.
```

- [ ] **Step 7: Amend the spec, section 5.3 (the kind registry, wire statuses and rule clarifications)**

In the same file, section 5.3, add a paragraph directly after the existing final paragraph
(`stageRef from the bridge or the paste dialog is matched...`), before `### 5.4 Bridge API and CLI`:

```markdown
**Milestone 3 notes.** Decision D18: the kind registry (`lib/artifacts/kinds.ts`) fixes 12 kinds;
only the three Research kinds (`research`, `fit_brief`, `people_notes`) can be shared across every
job at a company, and a kind arriving from outside the app that the registry does not recognize is
stored as `other` with a warning. Decision D12: the wire adds a fourth upsert status, `updated`, for
a title, kind or stage change with an unchanged body (rule 6). Decision D14 settles several edge
cases: a sent version's title, kind and stage can never change again (a metadata-only change on it is
reported `unchanged` with a warning, never applied); the in-app editor changes only the body, keeping
the latest version's own kind, title and stage; and "pushed after you edited version N" is computed
when a version is read, from whether the version before it carries an edit time, not stored as its
own column. Decision D21: the renderer is react-markdown with GFM tables and rehype-sanitize,
`skipHtml` on, so raw HTML is dropped rather than shown as text; only `http:`, `https:` and `mailto:`
links become clickable, images never load (rendered as their own alt text instead), and headings are
re-leveled by rank so a document's own numbering never collides with the surrounding page's.
```

- [ ] **Step 8: Amend the spec, section 5.4 (size limits, push semantics, the CLI)**

In the same file, section 5.4, add a paragraph directly after the existing final paragraph (`The
paste dialog in the app...`), before `### 5.5 Intake`:

```markdown
**Milestone 3 notes.** Decision D9: a push is capped at 50 documents, 1 MiB per document and 4 MB
per request (Vercel's own function body limit), read through a streaming cap that does not trust a
lying `Content-Length` header. Decision D11: the whole push is validated before anything is written,
then applied in one transaction; `?dry_run=true` runs the identical planner with nothing saved, and
one `artifact_pushed` event is written per push only when something actually changed, so a repeated
push stays silent. Decisions D30 to D35: the CLI bundles into one dependency-free Node file
(`cli/dist/jobsmith.mjs`, built with `pnpm cli:build`, installed with `npm install -g ./cli`; no
published package yet); credentials live in `$XDG_CONFIG_HOME/jobsmith/config.json` with owner-only
file permissions, read only from there or its two environment variable overrides; the suffix map in
`jobsmith.config.json` is read only from the content folder itself, with no parent-directory search,
matched by an exact suffix or the longest matching prefix before a dash; a file over 1 MiB, an
unreadable config or an invalid scope stops a push before anything is sent; and `--dry-run` asks the
server the same question a real push would and prints its answer.
```

- [ ] **Step 9: Amend the spec, section 5.9 (Settings ships early)**

In the same file, section 5.9, add a paragraph directly after the existing final paragraph (`Export
exists in Core because it is cheap now...`), before `### 5.10 Login and first run`:

```markdown
**Milestone 3 note.** Decision D27: API tokens ship in Core, in this milestone, ahead of the rest of
Settings - Profile and Export both arrive in Milestone 5, on the same page. A token is shown once, at
creation, and never again; only its sha256 hash and an eight-character display prefix are stored.
```

- [ ] **Step 10: Amend the spec, section 7 (the bridge's own rate limit)**

In the same file, section 7, add a paragraph directly after the existing final paragraph (`Outside
pull requests are not merged...`), before `## 8. Testing`:

```markdown
**Milestone 3 note.** Decision D4: the bridge's own rate limiter lives on the `api_token` row rather
than reusing the login library's own limiter (wired only to its one sign-in path) or adding a
separate table - the single `UPDATE` described in section 4's own note is the whole mechanism. The
limit is 120 requests per token per rolling 60-second window; a request with no valid token is never
counted, because a 256-bit token cannot be guessed and counting an anonymous request would add load
rather than shed it.
```

- [ ] **Step 11: Write `.gitleaks.toml`**

Decision D41. Unverified at planning time (gitleaks is not installed locally; CI's own gitleaks job
is what actually checks this file).

```toml
[extend]
useDefault = true

[[rules]]
id = "jobsmith-api-token"
description = "Jobsmith bridge API token"
regex = '''jsm_[A-Za-z0-9_-]{43}'''
```

`useDefault = true` keeps every one of gitleaks' own built-in rules active; this one rule is added on
top of them, matching the token shape D5 fixes (`jsm_` plus 43 base64url characters). Every test in
this milestone builds a token at runtime (`"jsm_" + "A".repeat(43)` or `generateToken()`, per the
global constraint on this), so this rule should never fire against the repo's own test files; if it
ever does on a real token accidentally committed, the fix is removing that commit's secret, never
loosening this rule.

- [ ] **Step 12: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all six exit 0. This task changes no source file (only docs and one lint config), so this
step confirms a documentation-only change did not somehow break a rule that reads Markdown or TOML
(it does not, in this repo's `eslint`/`check:tokens` configuration), not that anything new needed
fixing.

- [ ] **Step 13: Preview check in Chrome and Safari**

Deploy or run the full build (`pnpm build && pnpm start`, or the project's preview deploy). In both
Chrome and Safari, at desktop width and at 390px: sign in, open a job, paste a document on Research,
Documents and Prep, edit a document with Write and Preview, mark one as sent and confirm it locks,
create an API token in Settings and reveal it once, then run the CLI's `login`/`push`/`pull` against
that same deployment and confirm the pushed documents appear. Check both light and dark. This is the
milestone's own "Done when" bar (spec section 9: "A complete interview packet pushed from a folder of
markdown is readable inside the app, and a second push changes nothing") and the standing rule every
milestone ends with a preview link, a pass in Chrome and Safari, and the test suites green.

- [ ] **Step 14: Commit**

```bash
git add README.md docs/design-system.md docs/superpowers/specs/2026-09-18-jobsmith-core-design.md .gitleaks.toml
git commit -m "$(cat <<'EOF'
docs: document the CLI, the bridge API, and the M3 spec amendments
EOF
)"
```

- [ ] **Step 15 (owner-gated, not part of the builder's checklist): the owner's real push**

This step belongs to the owner alone. No builder, agent or CI job runs it, and it produces nothing
that gets committed.

1. The owner creates a real API token in Settings on their own instance and runs `jobsmith login`
   against it.
2. The owner runs `jobsmith push <slug> --dir <a real folder of their own markdown> --dry-run` first,
   on their own instance, and reads the printed report before doing anything else.
3. Only after reading that report does the owner rerun the same command without `--dry-run`, still
   against their own instance and their own account. Nothing from either run is committed to this
   repository.

---
