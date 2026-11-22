import type { ReactNode } from "react";
import type { WordPart } from "@/lib/compare/diff";

// Screen readers skip <del> and <ins> by default, so each run says what it is.
export function Del({ children }: { children: ReactNode }) {
  return (
    <del className="bg-status-action-soft text-foreground line-through">
      <span className="sr-only">removed </span>
      {children}
    </del>
  );
}

export function Ins({ children }: { children: ReactNode }) {
  return (
    <ins className="bg-status-approved-soft text-foreground underline">
      <span className="sr-only">added </span>
      {children}
    </ins>
  );
}

export const BLOCK = "whitespace-pre-wrap break-words";

export function Parts({ parts }: { parts: WordPart[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "removed" ? (
          <Del key={i}>{part.text}</Del>
        ) : part.kind === "added" ? (
          <Ins key={i}>{part.text}</Ins>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

export { SplitView } from "./split-view";
export { InlineView } from "./inline-view";
