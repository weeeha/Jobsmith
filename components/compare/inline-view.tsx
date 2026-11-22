import { Button } from "@/components/ui/button";
import type { ViewRow } from "@/lib/compare/collapse";
import { COPY } from "./compare-copy";
import { BLOCK, Del, Ins, Parts } from "./marks";

export function InlineView({ rows, onExpand }: { rows: ViewRow[]; onExpand(key: string): void }) {
  return (
    <div data-view="inline">
      {rows.map((row, i) => {
        if (row.type === "same") {
          return (
            <div key={i} className={BLOCK}>
              {row.units.join("")}
            </div>
          );
        }
        if (row.type === "folded") {
          return (
            <div key={row.key} className="py-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => onExpand(row.key)}>
                {COPY.showUnchanged(row.count)}
              </Button>
            </div>
          );
        }
        const skipped = row.wordsSkipped || !row.words;
        return (
          <div
            key={`change-${row.id}`}
            id={`change-${row.id}-inline`}
            data-change={row.id}
            className="my-1"
          >
            {row.removed.length > 0 && (
              <div className={BLOCK}>
                {skipped ? <Del>{row.removed.join("")}</Del> : <Parts parts={row.words!.left} />}
              </div>
            )}
            {row.added.length > 0 && (
              <div className={BLOCK}>
                {skipped ? <Ins>{row.added.join("")}</Ins> : <Parts parts={row.words!.right} />}
              </div>
            )}
            {skipped && <p className="text-sm text-muted-foreground">{COPY.tooManyToMark}</p>}
          </div>
        );
      })}
    </div>
  );
}
