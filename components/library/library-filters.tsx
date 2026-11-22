import Link from "next/link";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LIBRARY_COPY } from "@/lib/library/copy";
import type { LibraryKind } from "@/lib/prep/values";
import { LIBRARY_KINDS } from "@/lib/prep/values";

// A plain GET form: the server filters, so search and filters need no script.
export function LibraryFilters(props: {
  q?: string;
  kind?: LibraryKind;
  tag?: string;
  includeArchived: boolean;
}): React.ReactElement {
  const active = Boolean(props.q || props.kind || props.tag || props.includeArchived);
  const f = LIBRARY_COPY.fields;
  return (
    <form method="get" action="/library" role="search" aria-label="Search the library" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          <label htmlFor="library-q" className="text-sm text-muted-foreground">{f.search}</label>
          <Input id="library-q" name="q" type="search" defaultValue={props.q ?? ""} autoComplete="off" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="library-kind" className="text-sm text-muted-foreground">{f.kind}</label>
          <NativeSelect id="library-kind" name="kind" defaultValue={props.kind ?? ""}>
            <option value="">{f.allKinds}</option>
            {LIBRARY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {LIBRARY_COPY.kinds[kind]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="library-tag" className="text-sm text-muted-foreground">{f.tag}</label>
          <Input id="library-tag" name="tag" defaultValue={props.tag ?? ""} autoComplete="off" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label htmlFor="library-archived" className="inline-flex min-h-8 items-center gap-2 text-sm text-foreground">
          <input
            id="library-archived"
            name="archived"
            type="checkbox"
            value="1"
            defaultChecked={props.includeArchived}
            className="size-4 accent-primary"
          />
          {f.showArchived}
        </label>
        <Button type="submit" variant="outline" size="sm">
          {LIBRARY_COPY.filter}
        </Button>
        {active ? (
          <Link
            href="/library"
            className="inline-flex min-h-8 items-center rounded-md px-1 text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {LIBRARY_COPY.clear}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
