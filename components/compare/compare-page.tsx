"use client";

import * as React from "react";
import Link from "next/link";
import { collapseRows } from "@/lib/compare/collapse";
import { formatCompareHref, type CompareView } from "@/lib/compare/pair";
import { versionWhen } from "@/lib/compare/header";
import type { Comparison } from "@/lib/compare/load";
import type { DocRef } from "@/lib/artifacts/tabs";
import { COPY } from "./compare-copy";
import { CompareHeader } from "./compare-header";
import { ChangeNavigator } from "./change-navigator";
import { InlineView } from "./inline-view";
import { SplitView } from "./split-view";
import { VersionPicker } from "./version-picker";

// Both views are always in the DOM; CSS shows one. With no explicit view the
// split view takes over at the lg breakpoint (SPLIT_MIN_WIDTH_PX, 1024px).
const SPLIT_CLASS: Record<CompareView | "auto", string> = {
  auto: "hidden lg:block",
  split: "block",
  inline: "hidden",
};
const INLINE_CLASS: Record<CompareView | "auto", string> = {
  auto: "lg:hidden",
  split: "hidden",
  inline: "block",
};

function FullVersion({ heading, body }: { heading: string; body: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-medium text-foreground">{heading}</h2>
      <div className="whitespace-pre-wrap break-words">{body}</div>
    </section>
  );
}

export function CompareScreen(props: {
  comparison: Comparison;
  view: CompareView | null;
  basePath: string;
  doc: DocRef;
  backHref: string;
}): React.ReactElement {
  const { comparison, view, basePath, doc, backHref } = props;
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set());
  const onExpand = React.useCallback((key: string) => setExpanded((prev) => new Set(prev).add(key)), []);

  const rows = React.useMemo(
    () => (comparison.diff ? collapseRows(comparison.diff.rows, expanded) : []),
    [comparison.diff, expanded],
  );

  const versions = comparison.versions.map((v) => ({
    version: v.version,
    label: `Version ${v.version} (${versionWhen(v).word})`,
  }));
  const hrefFor = (a: number, b: number) => formatCompareHref(basePath, { doc, a, b, ...(view ? { view } : {}) });
  const mode = view ?? "auto";

  return (
    <div className="flex flex-col gap-4 p-6 pb-40 md:pb-6">
      <Link href={backHref} className="text-sm text-muted-foreground underline">
        Back to the document
      </Link>
      <CompareHeader comparison={comparison} title={comparison.title} />
      <VersionPicker versions={versions} a={comparison.a.version} b={comparison.b.version} hrefFor={hrefFor} />
      {comparison.mode === "same" && (
        <p role="status" className="text-sm text-foreground">
          {COPY.pickDifferent}
        </p>
      )}
      {comparison.mode === "too_different" && (
        <>
          <p className="text-sm text-foreground">{COPY.tooDifferent}</p>
          <FullVersion heading={`Version ${comparison.a.version}`} body={comparison.a.bodyMd} />
          <FullVersion heading={`Version ${comparison.b.version}`} body={comparison.b.bodyMd} />
        </>
      )}
      {comparison.mode === "diff" && comparison.diff && (
        <>
          <ChangeNavigator total={comparison.diff.changeCount} />
          <div className={SPLIT_CLASS[mode]}>
            <SplitView rows={rows} onExpand={onExpand} />
          </div>
          <div className={INLINE_CLASS[mode]}>
            <InlineView rows={rows} onExpand={onExpand} />
          </div>
        </>
      )}
    </div>
  );
}
