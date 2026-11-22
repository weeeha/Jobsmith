import Link from "next/link";

import { ToneChip } from "@/components/fit/fit-chips";
import { ArchiveButton, ItemEditor } from "@/components/library/item-editor";
import { MarkHistory } from "@/components/library/mark-history";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { LIBRARY_COPY } from "@/lib/library/copy";
import type { LibraryItemView } from "@/lib/library/items";
import type { MarkHistory as History } from "@/lib/library/usage";

export function ItemView(props: {
  item: LibraryItemView;
  source: { slug: string; label: string } | null;
  used: number | null;
  history: History | null;
}): React.ReactElement {
  const { item } = props;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/library"
          className="w-fit rounded-md text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Library
        </Link>
        <h1 className="min-w-0 break-words text-lg font-semibold">{item.title}</h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ToneChip tone="neutral" data-kind={item.kind}>
            {LIBRARY_COPY.kinds[item.kind]}
          </ToneChip>
          {item.archivedAt ? <ToneChip tone="outline">{LIBRARY_COPY.archived}</ToneChip> : null}
          {props.used !== null ? <span className="text-xs text-muted-foreground">{LIBRARY_COPY.usedIn(props.used)}</span> : null}
        </div>
        {item.tags.length > 0 ? (
          <ul aria-label="Tags" className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <li key={tag}>
                <Badge variant="outline">{tag}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
        {props.source ? (
          <p className="text-sm text-muted-foreground">
            {LIBRARY_COPY.sourceJob}:{" "}
            <Link
              href={`/jobs/${props.source.slug}?tab=prep`}
              className="rounded-md text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {props.source.label}
            </Link>
          </p>
        ) : null}
      </div>

      {item.archivedAt ? (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm">{LIBRARY_COPY.archivedNote}</p>
      ) : null}

      <ItemEditor
        id={item.id}
        title={item.title}
        bodyMd={item.bodyMd}
        tags={item.tags}
        renderedBody={<Markdown source={item.bodyMd} headingBase={2} />}
      />

      {props.history ? <MarkHistory history={props.history} /> : null}

      <div className="border-t border-border pt-4">
        <ArchiveButton id={item.id} archived={item.archivedAt !== null} />
      </div>
    </div>
  );
}
