import { requireUser } from "@/lib/auth/session";
import { KanbanColumn } from "@/components/super-ai/kanban-column";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";

export default async function BoardPage() {
  await requireUser();

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Board</h1>
      <p className="mt-2 text-muted-foreground">
        No jobs yet. Adding jobs arrives in the next milestone.
      </p>
      {/* tabIndex + aria-label, not a bare div: this row scrolls sideways
          once the columns outrun the viewport, and a scroll container needs
          a tab stop to be keyboard-reachable (kanban-view.tsx applies the
          same fix to itself). */}
      <section
        tabIndex={0}
        aria-label="Board columns"
        className="mt-6 flex gap-4 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {STAGE_KINDS.map((stage) => (
          <KanbanColumn key={stage.kind} title={stage.columnTitle} count={0} />
        ))}
      </section>
    </div>
  );
}
