import * as React from "react";

import { Markdown } from "@/components/markdown";
import { LocalTime } from "@/components/local-time";
import { kindInfo, ORIGIN_WORDS } from "@/lib/artifacts/kinds";
import type { ArtifactRow } from "@/lib/db/scoped";

export function DocumentView(props: {
  doc: ArtifactRow;
  companyName: string | null;
  stageLabel: string | null;
  actions: React.ReactNode;
  children?: React.ReactNode;
}): React.ReactElement {
  const titleId = React.useId();

  const metaParts: React.ReactNode[] = [
    kindInfo(props.doc.kind).label,
    `Version ${props.doc.version}`,
    <React.Fragment key="origin">
      {ORIGIN_WORDS[props.doc.origin]} <LocalTime value={props.doc.createdAt} mode="date" />
    </React.Fragment>,
  ];
  if (props.doc.editedAt) {
    metaParts.push(
      <React.Fragment key="edited">
        Edited <LocalTime value={props.doc.editedAt} mode="date" />
      </React.Fragment>,
    );
  }
  if (props.doc.sentAt) {
    metaParts.push(
      <React.Fragment key="sent">
        Sent <LocalTime value={props.doc.sentAt} mode="date" />
      </React.Fragment>,
    );
  }
  if (props.stageLabel) {
    metaParts.push(props.stageLabel);
  }
  if (props.companyName) {
    metaParts.push(`Shared with every job at ${props.companyName}`);
  }

  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-3">
      <div>
        <h2
          id={titleId}
          tabIndex={-1}
          data-document-title
          className="break-words text-lg font-semibold text-foreground outline-none"
        >
          {props.doc.title}
        </h2>
        {/* Built as an array of nodes, not one template string: a LocalTime
            element sitting between two plain-text parts cannot be
            flattened into a string, the same reason tab-timeline.tsx's own
            event rows never interpolate LocalTime into a template literal
            either. */}
        <p className="break-words text-xs text-muted-foreground">{joinWithDot(metaParts)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{props.actions}</div>
      {props.children ?? <Markdown source={props.doc.bodyMd} headingBase={3} />}
    </article>
  );
}

function joinWithDot(parts: React.ReactNode[]): React.ReactNode {
  return parts.map((part, index) => (
    <React.Fragment key={index}>
      {index > 0 ? " · " : null}
      {part}
    </React.Fragment>
  ));
}
