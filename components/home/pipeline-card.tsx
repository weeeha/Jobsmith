import type { ColumnCount } from "@/lib/attention/load";
import { SIDE_COPY } from "@/lib/attention/copy";

export function PipelineCard({ columns }: { columns: ColumnCount[] }) {
  return (
    <section aria-labelledby="home-pipeline" className="rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
      <h2 id="home-pipeline" className="font-medium text-foreground">
        {SIDE_COPY.pipeline}
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {columns.map((column) => (
          <li key={column.kind} className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">{column.title}</span>
            <span className="font-medium tabular-nums text-foreground">{column.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
