"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { markQuestionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { markedAnnouncement, PREP_COPY } from "@/lib/prep/copy";
import { MARK_LEVELS, type MarkLevel, type MarkScope } from "@/lib/prep/values";
import { messageFor } from "@/lib/pipeline/messages";

type MarkTarget = {
  questionKey: string;
  opportunityId: string | null;
  scope: MarkScope;
  onMarked: (level: MarkLevel) => void;
  drilled?: boolean;
};

/**
 * Writes one mark, announces it and reports the level the server kept. The
 * caller owns what happens after (a refresh, the next card). Shared by the
 * buttons and by keyboard shortcuts on the players.
 */
export function useMark(target: MarkTarget): { mark: (level: MarkLevel) => void; pending: boolean } {
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();

  function mark(level: MarkLevel) {
    startTransition(async () => {
      try {
        const result = await markQuestionAction({
          opportunityId: target.opportunityId,
          scope: target.scope,
          questionKey: target.questionKey,
          level,
          markedAt: new Date().toISOString(),
          drilled: target.drilled ?? false,
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        announce(markedAnnouncement(result.data.level));
        target.onMarked(result.data.level);
      } catch (error) {
        console.error("mark failed", error);
        toast.error(`${PREP_COPY.hub.markFailed} ${messageFor("unexpected")}`);
      }
    });
  }

  return { mark, pending };
}

/** The three mark buttons, shared by the hub and the players. */
export function MarkButtons(props: MarkTarget & { current: MarkLevel | null; className?: string }): React.ReactElement {
  const { mark, pending } = useMark(props);

  return (
    <div role="group" aria-label={PREP_COPY.hub.markGroup} className={props.className ?? "flex flex-wrap gap-2"}>
      {MARK_LEVELS.map((level) => {
        const pressed = props.current === level;
        return (
          <Button
            key={level}
            type="button"
            variant={pressed ? "secondary" : "outline"}
            aria-pressed={pressed}
            disabled={pending}
            onClick={() => mark(level)}
          >
            {pressed ? <Check aria-hidden="true" /> : null}
            {PREP_COPY.marks[level]}
          </Button>
        );
      })}
    </div>
  );
}
