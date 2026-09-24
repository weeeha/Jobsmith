import Link from "next/link";

import { formatDocRef, scopeOf, type DocGroup, type DocRef } from "@/lib/artifacts/tabs";
import { kindInfo, type ArtifactTab } from "@/lib/artifacts/kinds";

export function DocumentList(props: {
  label: string;
  groups: DocGroup[];
  selected: DocRef | null;
  basePath: string;
  tab: ArtifactTab;
}): React.ReactElement {
  return (
    <nav aria-label={props.label} className="flex flex-col gap-4">
      {props.groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          {group.heading !== "" ? <h2 className="text-sm font-medium text-foreground">{group.heading}</h2> : null}
          <ul className="flex flex-col gap-3">
            {group.docs.map((doc) => {
              const ref = { scope: scopeOf(doc), key: doc.key };
              const isSelected =
                props.selected !== null && ref.scope === props.selected.scope && ref.key === props.selected.key;
              return (
                <li key={`${ref.scope}:${ref.key}`} className="flex flex-col gap-0.5">
                  <Link
                    href={`${props.basePath}?tab=${props.tab}&doc=${formatDocRef(ref)}`}
                    aria-current={isSelected ? "true" : undefined}
                    className="break-words font-medium text-foreground"
                  >
                    {doc.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {`${kindInfo(doc.kind).label} · v${doc.version}`}
                    {doc.sentAt ? " · Sent" : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
