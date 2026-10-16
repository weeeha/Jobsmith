"use client";

import * as React from "react";
import Link from "next/link";

import { AttentionItemRow } from "@/components/home/attention-item";
import { EmptyState } from "@/components/super-ai/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { EMPTY_COPY, GROUP_TITLES } from "@/lib/attention/copy";
import { ATTENTION_KINDS, type AttentionItem } from "@/lib/attention/items";
import { focusWasLost } from "@/lib/dom/focus";
import { cn } from "@/lib/utils";

const keyOf = (item: AttentionItem) =>
  `${item.kind}:${item.job.id}:${"stage" in item ? item.stage.id : ""}`;

export function AttentionList({ items }: { items: AttentionItem[] }) {
  const listRef = React.useRef<HTMLDivElement>(null);
  // Flat position of the row the user last acted on, so focus can move to the
  // row that takes its place once the revalidated list drops it.
  const actedIndex = React.useRef<number | null>(null);
  const previousCount = React.useRef(items.length);

  React.useEffect(() => {
    const acted = actedIndex.current;
    const shrank = items.length < previousCount.current;
    previousCount.current = items.length;
    if (acted === null || !shrank) return;
    actedIndex.current = null;
    if (!focusWasLost()) return;
    const primaries = listRef.current?.querySelectorAll<HTMLElement>("[data-attention-primary]");
    const next = primaries?.[Math.min(acted, (primaries?.length ?? 1) - 1)];
    // Empty list: land on the page heading (tabIndex -1 in page.tsx).
    (next ?? document.querySelector<HTMLElement>("h1"))?.focus();
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-card ring-1 ring-foreground/10">
        <EmptyState
          title={EMPTY_COPY.title}
          description={EMPTY_COPY.description}
          action={
            <Link href="/board" className={cn(buttonVariants())}>
              {EMPTY_COPY.action}
            </Link>
          }
        />
      </div>
    );
  }

  const flat = items.map(keyOf);
  return (
    <div ref={listRef} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      {ATTENTION_KINDS.map((kind) => {
        const group = items.filter((i) => i.kind === kind);
        if (group.length === 0) return null;
        return (
          <section key={kind} aria-labelledby={`home-group-${kind}`} className="border-b last:border-b-0">
            <h2 id={`home-group-${kind}`} className="px-4 pt-4 text-sm font-medium text-foreground">
              {GROUP_TITLES[kind]} <span className="ml-1 text-muted-foreground">{group.length}</span>
            </h2>
            <ul className="divide-y">
              {group.map((item) => (
                <AttentionItemRow
                  key={keyOf(item)}
                  item={item}
                  onActed={() => {
                    actedIndex.current = flat.indexOf(keyOf(item));
                  }}
                  onFailed={() => {
                    actedIndex.current = null;
                  }}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
