import { Skeleton } from "@/components/ui/skeleton";

const ROWS = 4;

// Stands in for the attention list while Home loads: the same card and row
// rhythm as AttentionItemRow (reason, job line, meta, then the action), so the
// list arrives without the page jumping.
export function HomeSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start" aria-busy="true">
      <span className="sr-only" role="status">
        Loading Home
      </span>
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10" aria-hidden="true">
        <ul className="divide-y">
          {Array.from({ length: ROWS }, (_, i) => (
            <li key={i} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-64 max-w-full" />
                <Skeleton className="h-3.5 w-48 max-w-full" />
                <Skeleton className="h-3 w-36 max-w-full" />
              </div>
              <Skeleton className="h-8 w-24 rounded-lg" />
            </li>
          ))}
        </ul>
      </div>
      <div className="lg:w-80 lg:shrink-0" />
    </div>
  );
}
