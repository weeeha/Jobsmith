import { COLLAPSE_CONTEXT, COLLAPSE_MIN_RUN } from "./limits";
import type { DiffRow } from "./diff";

export type ViewRow =
  | { type: "same"; units: string[] }
  | { type: "folded"; hidden: string[]; count: number; key: string }
  | Extract<DiffRow, { type: "change" }>;

/**
 * Fold long runs of unchanged units. A run over COLLAPSE_MIN_RUN units keeps
 * COLLAPSE_CONTEXT units next to each neighbouring change and folds the rest.
 * The first and last runs keep context only on their inner side. A document with
 * no change at all stays whole. Fold keys are `fold-<row index>`; a key in
 * `expanded` leaves that run whole.
 */
export function collapseRows(rows: DiffRow[], expanded: ReadonlySet<string>): ViewRow[] {
  const out: ViewRow[] = [];
  rows.forEach((row, index) => {
    if (row.type === "change") {
      out.push(row);
      return;
    }
    const key = `fold-${index}`;
    const units = row.units;
    const first = index === 0;
    const last = index === rows.length - 1;
    if (units.length <= COLLAPSE_MIN_RUN || expanded.has(key) || (first && last)) {
      out.push({ type: "same", units });
      return;
    }
    const head = first ? 0 : COLLAPSE_CONTEXT;
    const tail = last ? 0 : COLLAPSE_CONTEXT;
    const hidden = units.slice(head, units.length - tail);
    if (head > 0) out.push({ type: "same", units: units.slice(0, head) });
    out.push({ type: "folded", hidden, count: hidden.length, key });
    if (tail > 0) out.push({ type: "same", units: units.slice(units.length - tail) });
  });
  return out;
}
