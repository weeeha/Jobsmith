"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { snoozeAction } from "@/app/(app)/actions";
import { completeNextActionAction } from "@/app/(app)/jobs/[slug]/actions";
import { useAnnounce } from "@/components/live-announcer";
import { LocalTime } from "@/components/local-time";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SNOOZABLE_RULES, type AttentionItem, type SnoozableRule } from "@/lib/attention";
import {
  SNOOZE_LABELS,
  attentionReason,
  doneAnnouncement,
  doneFailure,
  primaryAction,
  snoozeAriaLabel,
  snoozeFailure,
  snoozedAnnouncement,
} from "@/lib/attention/messages";
import { SNOOZE_PRESETS, type SnoozePreset } from "@/lib/attention/snooze";
import { focusWasLost, correctFocusOnceLost } from "@/lib/dom/focus";
import { messageFor } from "@/lib/pipeline/messages";

function isSnoozableRule(rule: AttentionItem["rule"]): rule is SnoozableRule {
  return (SNOOZABLE_RULES as readonly string[]).includes(rule);
}

// A finished item leaves the list, so the button that was clicked disappears
// with it. Focus goes to the Today heading, which the page makes focusable.
function focusToday() {
  document.getElementById("home-today")?.focus();
}

export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <ul aria-label="Things to do today" className="flex flex-col divide-y rounded-lg border">
      {items.map((item) => (
        <AttentionRow key={item.key} item={item} />
      ))}
    </ul>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();
  const doneRef = React.useRef<HTMLButtonElement>(null);
  const snoozeRef = React.useRef<HTMLButtonElement>(null);
  const reason = attentionReason(item);
  const action = primaryAction(item);

  function handleDone() {
    startTransition(async () => {
      try {
        const result = await completeNextActionAction(item.opportunityId);
        if (!result.ok) {
          toast.error(doneFailure(result.message));
          if (focusWasLost()) doneRef.current?.focus();
          return;
        }
        announce(doneAnnouncement(item));
        correctFocusOnceLost(focusToday);
      } catch (error) {
        // The action can reject before it ever returns a result (a dropped
        // connection); nothing changed, so the button is still the place for
        // focus to be.
        console.error("complete next action failed", error);
        toast.error(doneFailure(messageFor("unexpected")));
        if (focusWasLost()) doneRef.current?.focus();
      }
    });
  }

  function handleSnooze(preset: SnoozePreset) {
    if (!isSnoozableRule(item.rule)) return;
    const rule = item.rule;
    startTransition(async () => {
      try {
        const result = await snoozeAction(item.opportunityId, rule, preset);
        if (!result.ok) {
          toast.error(snoozeFailure(item, result.message));
          if (focusWasLost()) snoozeRef.current?.focus();
          return;
        }
        announce(snoozedAnnouncement(item));
        correctFocusOnceLost(focusToday);
      } catch (error) {
        console.error("snooze failed", error);
        toast.error(snoozeFailure(item, messageFor("unexpected")));
        if (focusWasLost()) snoozeRef.current?.focus();
      }
    });
  }

  return (
    <li className="flex flex-col gap-2 p-4">
      <Link href={`/jobs/${item.slug}`} className="font-medium break-words text-foreground hover:underline">
        {item.roleTitle} at {item.companyName}
      </Link>
      <p data-attention-reason="" className="text-sm break-words text-muted-foreground">
        {reason.before}
        {reason.time ? <LocalTime value={reason.time} mode="datetime" /> : null}
        {reason.after}
      </p>
      <div className="flex flex-wrap gap-2">
        {action.kind === "link" ? (
          <Link
            href={action.href}
            aria-label={action.ariaLabel}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {action.label}
          </Link>
        ) : (
          <Button
            ref={doneRef}
            size="sm"
            variant="outline"
            aria-label={action.ariaLabel}
            disabled={pending}
            onClick={handleDone}
          >
            {action.label}
          </Button>
        )}
        {item.snoozable && isSnoozableRule(item.rule) ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  ref={snoozeRef}
                  size="sm"
                  variant="outline"
                  aria-label={snoozeAriaLabel(item)}
                  disabled={pending}
                />
              }
            >
              Snooze
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {SNOOZE_PRESETS.map((preset) => (
                <DropdownMenuItem key={preset} onClick={() => handleSnooze(preset)}>
                  {SNOOZE_LABELS[preset]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
}
