import { LocalTime } from "@/components/local-time";
import { summaryLine, versionWhen } from "@/lib/compare/header";
import type { Comparison } from "@/lib/compare/load";

function When({ v, lead }: { v: Comparison["a"]; lead?: boolean }) {
  const when = versionWhen(v);
  return (
    <>
      {`${lead ? "Version" : "version"} ${v.version} (${when.word} `}
      <LocalTime value={when.at} mode="date" />
      {")"}
    </>
  );
}

/** "Version 3 (edited 2 Oct) and version 4 (pushed 5 Oct) · 48 words added, ..." */
export function CompareHeader({ comparison, title }: { comparison: Comparison; title: string }) {
  const { a, b, diff, notice } = comparison;
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        <When v={a} lead />
        {" and "}
        <When v={b} />
        {diff ? ` · ${summaryLine(diff.summary)}` : null}
      </p>
      {notice ? (
        <p className="text-sm text-muted-foreground">{`Pushed after you edited version ${notice.baseVersion}.`}</p>
      ) : null}
    </header>
  );
}
