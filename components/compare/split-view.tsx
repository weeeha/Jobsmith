import { Button } from "@/components/ui/button";
import type { ViewRow } from "@/lib/compare/collapse";
import { COPY } from "./compare-copy";
import { BLOCK, Del, Ins, Parts } from "./marks";

export function SplitView({ rows, onExpand }: { rows: ViewRow[]; onExpand(key: string): void }) {
  return (
    <div className="overflow-x-auto" data-view="split">
      <div className="min-w-160">
        {rows.map((row, i) => {
          if (row.type === "same") {
            return (
              <div key={i} className="grid grid-cols-2 gap-x-4">
                <div className={BLOCK}>{row.units.join("")}</div>
                <div className={BLOCK}>{row.units.join("")}</div>
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
              id={`change-${row.id}-split`}
              data-change={row.id}
              className="my-1 grid grid-cols-2 gap-x-4"
            >
              <div className={BLOCK}>
                {skipped ? (
                  row.removed.length > 0 && <Del>{row.removed.join("")}</Del>
                ) : (
                  <Parts parts={row.words!.left} />
                )}
              </div>
              <div className={BLOCK}>
                {skipped ? (
                  row.added.length > 0 && <Ins>{row.added.join("")}</Ins>
                ) : (
                  <Parts parts={row.words!.right} />
                )}
              </div>
              {skipped && (
                <p className="col-span-2 text-sm text-muted-foreground">{COPY.tooManyToMark}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
