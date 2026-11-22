import Link from "next/link";

import { ToneChip } from "@/components/fit/fit-chips";
import { EmptyState } from "@/components/super-ai/empty-state";
import { Badge } from "@/components/ui/badge";
import { LIBRARY_COPY } from "@/lib/library/copy";
import type { LibraryListRow } from "@/lib/library/items";

export function LibraryList(props: {
  rows: LibraryListRow[];
  used: Map<string, number>;
  filtered: boolean;
}): React.ReactElement {
  if (props.rows.length === 0) {
    return (
      <EmptyState size="panel" title={props.filtered ? LIBRARY_COPY.noMatches : LIBRARY_COPY.empty} />
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {props.rows.map((row) => {
        const used = row.questionKey === null ? null : (props.used.get(row.questionKey) ?? 0);
        return (
          <li key={row.id} className="flex flex-col gap-1.5 px-3 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <ToneChip tone="neutral" data-kind={row.kind}>
                {LIBRARY_COPY.kinds[row.kind]}
              </ToneChip>
              {row.archivedAt ? <ToneChip tone="outline">{LIBRARY_COPY.archived}</ToneChip> : null}
              <Link
                href={`/library/${row.id}`}
                className="min-w-0 break-words rounded-md text-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {row.title}
              </Link>
            </div>
            {row.firstLine ? <p className="min-w-0 break-words text-sm text-muted-foreground">{row.firstLine}</p> : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {row.tags.length > 0 ? (
                <ul aria-label="Tags" className="flex flex-wrap gap-1">
                  {row.tags.map((tag) => (
                    <li key={tag}>
                      <Badge variant="outline">{tag}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
              {used !== null ? <span className="text-xs text-muted-foreground">{LIBRARY_COPY.usedIn(used)}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
