"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { OFFLINE_COPY } from "@/lib/offline/copy";
import { waitingLine, type QueuedMark } from "@/lib/offline/queue";

/**
 * The small line over the bottom of the viewport: how many marks wait to sync,
 * and any mark that failed ten times with Retry and Discard. Renders nothing
 * when the queue is empty. The count sits in a polite live region.
 */
export function SyncStatus(props: {
  waiting: number;
  stuck: QueuedMark[];
  onRetry(id: string): void;
  onDiscard(id: string): void;
}): React.ReactElement | null {
  const { waiting, stuck } = props;
  if (waiting === 0 && stuck.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex flex-col items-center gap-2 px-4 md:bottom-4">
      {waiting > 0 ? (
        <p
          role="status"
          aria-live="polite"
          className="pointer-events-auto rounded-full border border-border bg-muted px-3 py-1 text-sm text-foreground"
        >
          {waitingLine(waiting)}
        </p>
      ) : null}
      {stuck.map((mark) => (
        <div
          key={mark.id}
          role="group"
          aria-label={OFFLINE_COPY.sync.stuckLine(1)}
          className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
        >
          <span>
            {OFFLINE_COPY.sync.stuckLine(1)}. {OFFLINE_COPY.sync.stuckHelp}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => props.onRetry(mark.id)}>
            {OFFLINE_COPY.sync.retry}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => props.onDiscard(mark.id)}>
            {OFFLINE_COPY.sync.discard}
          </Button>
        </div>
      ))}
    </div>
  );
}
