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
    void _node;
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
  table: ({ node: _node, ...props }) => {
    void _node;
    return (
      <div tabIndex={0} className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm" {...props} />
      </div>
    );
  },
  pre: ({ node: _node, ...props }) => {
    void _node;
    return (
      <pre
        tabIndex={0}
        className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-sm"
        {...props}
      />
    );
  },
  a: ({ node: _node, href, children }) => {
    void _node;
    return href && allowedProtocol(href) ? (
      <a href={href} target="_blank" rel="noreferrer" className="underline">
        {children}
      </a>
    ) : (
      <>{children}</>
    );
  },
  // Images never load, full stop: a pushed or pasted document could
  // otherwise reference a remote URL that fires the instant the document is
  // viewed, with no user action in between (a tracking pixel). The alt text
  // is the one part of an image worth keeping, so it survives as plain text.
  img: ({ node: _node, alt }) => {
    void _node;
    return <span>{`Image: ${alt ?? ""}`}</span>;
  },
  input: ({ node: _node, type, checked, ...props }) => {
    void _node;
    return type === "checkbox" ? (
      <input
        type="checkbox"
        checked={checked ?? false}
        disabled
        aria-label={checked ? "Done" : "Not done"}
        {...props}
      />
    ) : (
      <input type={type} checked={checked} {...props} />
    );
  },
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
