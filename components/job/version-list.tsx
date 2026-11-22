import Link from "next/link";

import { formatDocRef, type DocRef } from "@/lib/artifacts/tabs";
import { formatCompareHref } from "@/lib/compare/pair";
import { editedBaseOf, versionNotice } from "@/lib/artifacts/plan";
import { ORIGIN_WORDS } from "@/lib/artifacts/kinds";
import { LocalTime } from "@/components/local-time";
import type { ArtifactMeta } from "@/lib/db/scoped";

export function VersionList(props: {
  title: string;
  documentKey: string;
  basePath: string;
  docRef: DocRef;
  compareBasePath: string;
  versions: ArtifactMeta[]; // ascending, DocumentView.versions' own contract
}): React.ReactElement {
  const newestFirst = [...props.versions].reverse();
  const linkClass = "text-xs text-foreground underline underline-offset-4";

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">Versions</h3>
      <ol aria-label={`Versions of ${props.title}`} className="flex flex-col gap-3">
        {newestFirst.map((version) => {
          const notice = versionNotice(props.versions, version.version);
          const index = props.versions.findIndex((v) => v.id === version.id);
          const previous = index > 0 ? props.versions[index - 1] : null;
          const editedBase = notice ? editedBaseOf(props.versions, version.version) : null;
          return (
            <li key={version.id} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline gap-x-3">
              <Link
                href={`${props.basePath}?tab=documents&doc=${formatDocRef({ scope: "opportunity", key: props.documentKey })}&v=${version.version}`}
                className="font-medium text-foreground"
              >
                {`Version ${version.version}`}
              </Link>
              {previous ? (
                <Link
                  href={formatCompareHref(props.compareBasePath, {
                    doc: props.docRef,
                    a: previous.version,
                    b: version.version,
                  })}
                  aria-label={`Compare version ${previous.version} with version ${version.version}`}
                  className={linkClass}
                >
                  Compare
                </Link>
              ) : null}
              </div>
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
              {notice ? (
                <p className="text-xs text-muted-foreground">
                  {notice}{" "}
                  {editedBase !== null ? (
                    <Link
                      href={formatCompareHref(props.compareBasePath, {
                        doc: props.docRef,
                        a: editedBase,
                        b: version.version,
                      })}
                      className="text-foreground underline underline-offset-4"
                    >
                      See what changed
                    </Link>
                  ) : null}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
