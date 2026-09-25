import Link from "next/link";

import { formatDocRef } from "@/lib/artifacts/tabs";
import { versionNotice } from "@/lib/artifacts/plan";
import { ORIGIN_WORDS } from "@/lib/artifacts/kinds";
import { LocalTime } from "@/components/local-time";
import type { ArtifactMeta } from "@/lib/db/scoped";

export function VersionList(props: {
  title: string;
  documentKey: string;
  basePath: string;
  versions: ArtifactMeta[]; // ascending, DocumentView.versions' own contract
}): React.ReactElement {
  const newestFirst = [...props.versions].reverse();

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">Versions</h3>
      <ol aria-label={`Versions of ${props.title}`} className="flex flex-col gap-3">
        {newestFirst.map((version) => {
          const notice = versionNotice(props.versions, version.version);
          return (
            <li key={version.id} className="flex flex-col gap-0.5">
              <Link
                href={`${props.basePath}?tab=documents&doc=${formatDocRef({ scope: "opportunity", key: props.documentKey })}&v=${version.version}`}
                className="font-medium text-foreground"
              >
                {`Version ${version.version}`}
              </Link>
              <p className="text-xs text-muted-foreground">
                {ORIGIN_WORDS[version.origin]} <LocalTime value={version.createdAt} mode="date" />
                {version.editedAt ? (
                  <>
                    {" · Edited "}
                    <LocalTime value={version.editedAt} mode="date" />
                  </>
                ) : null}
                {version.sentAt ? (
                  <>
                    {" · Sent "}
                    <LocalTime value={version.sentAt} mode="date" />
                  </>
                ) : null}
              </p>
              {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
