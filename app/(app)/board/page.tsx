import { requireUser } from "@/lib/auth/session";
import { KanbanColumn } from "@/components/super-ai/kanban-column";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";

export default async function BoardPage(props: PageProps<"/board">) {
  void props;
  await requireUser();

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Board</h1>
      <p className="mt-2 text-muted-foreground">
        No jobs yet. Adding jobs arrives in the next milestone.
      </p>
      {/* tabIndex + aria-label, not a bare div: this row scrolls sideways
          once the columns outrun the viewport, and axe's
          scrollable-region-focusable rule catches a scroll container with
          no tab stop (kanban-view.tsx applies the same fix to itself, for
          the same reason). Found and fixed while building Task 8's axe suite. */}
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
