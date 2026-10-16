"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { markAppliedFromHomeAction, markDoneFromHomeAction, snoozeFromHomeAction } from "@/app/(app)/home-actions";
import { LocalTime } from "@/components/local-time";
import { useAnnounce } from "@/components/live-announcer";
import { Button, buttonVariants } from "@/components/ui/button";
import { SnoozeMenu } from "@/components/home/snooze-menu";
import { ANNOUNCE, FAILURE_MESSAGE, itemCopy, primaryAction, snoozedMessage } from "@/lib/attention/copy";
import type { AttentionItem as Item } from "@/lib/attention/items";
import type { SnoozableKind, SnoozeDays } from "@/lib/attention/snooze";
import { focusWasLost } from "@/lib/dom/focus";
import type { Result } from "@/lib/result";
import { cn } from "@/lib/utils";

export function AttentionItemRow({
  item,
  onActed,
  onFailed,
}: {
  item: Item;
  onActed: () => void;
  onFailed: () => void;
}) {
  const copy = itemCopy(item);
  const action = primaryAction(item);
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();
  const primaryRef = React.useRef<HTMLButtonElement>(null);
  const snoozeRef = React.useRef<HTMLButtonElement>(null);
  const isInterview = item.kind === "interview";

  // Runs one write. On success the revalidated page drops this row and the
  // list recovers focus; on failure the row stays, so focus goes back to the
  // control that was disabled while pending.
  function run<T>(call: () => Promise<Result<T, string>>, onOk: (data: T) => void) {
    onActed();
    startTransition(async () => {
      try {
        const result = await call();
        if (result.ok) {
          onOk(result.data);
          return;
        }
        toast.error(result.message);
      } catch (error) {
        console.error("home action failed", error);
        toast.error(FAILURE_MESSAGE);
      }
      // The row stays, so the list must not move focus the next time it shrinks.
      onFailed();
      if (focusWasLost()) (primaryRef.current ?? snoozeRef.current)?.focus();
    });
  }

  const snooze = (days: SnoozeDays) => {
    if (item.kind === "interview") return;
    run(
      () =>
        snoozeFromHomeAction({
          opportunityId: item.job.id,
          kind: item.kind satisfies SnoozableKind,
          days,
          stageId: item.kind === "passed" ? item.stage.id : null,
        }),
      (data) => toast.success(snoozedMessage(data.at)),
    );
  };

  const { meta } = copy;
  return (
    <li className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <div className="min-w-0 break-words">
        <p className={isInterview ? "text-base font-semibold text-foreground" : "text-sm font-medium text-foreground"}>
          {copy.reason}
        </p>
        <p className="text-sm text-muted-foreground">{copy.jobLine}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {meta.prefix}
          {meta.time ? <LocalTime value={meta.time.at} mode={meta.time.mode} /> : null}
          {meta.suffix}
        </p>
      </div>
      <div role="group" aria-label={`Actions for ${copy.jobLine}`} className="flex shrink-0 items-center gap-2">
        {action.type === "link" ? (
          // A real link styled as a button: Base UI's Button would add role="button" to an anchor.
          <Link
            data-attention-primary
            href={action.href}
            className={cn(buttonVariants({ variant: isInterview ? "default" : "outline", size: isInterview ? "default" : "sm" }))}
          >
            {action.label}
          </Link>
        ) : (
          <Button
            ref={primaryRef}
            data-attention-primary
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              action.type === "mark_done"
                ? run(() => markDoneFromHomeAction(item.job.id), () => announce(ANNOUNCE.done))
                : run(() => markAppliedFromHomeAction(item.job.id), () => announce(ANNOUNCE.applied))
            }
          >
            {action.label}
          </Button>
        )}
        {isInterview ? null : <SnoozeMenu triggerRef={snoozeRef} disabled={pending} onSnooze={snooze} />}
      </div>
    </li>
  );
}
