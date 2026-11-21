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

/**
 * The three mark buttons, shared by the hub and the players. The caller owns
 * what happens after a mark (a refresh, the next card); this only writes the
 * mark, announces it and reports the level the server kept.
 */
export function MarkButtons(props: {
  questionKey: string;
  opportunityId: string | null;
  scope: MarkScope;
  current: MarkLevel | null;
  onMarked: (level: MarkLevel) => void;
  drilled?: boolean;
  className?: string;
}): React.ReactElement {
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();

  function mark(level: MarkLevel) {
    startTransition(async () => {
      try {
        const result = await markQuestionAction({
          opportunityId: props.opportunityId,
          scope: props.scope,
          questionKey: props.questionKey,
          level,
          markedAt: new Date().toISOString(),
          drilled: props.drilled ?? false,
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        announce(markedAnnouncement(result.data.level));
        props.onMarked(result.data.level);
      } catch (error) {
        console.error("mark failed", error);
        toast.error(`${PREP_COPY.hub.markFailed} ${messageFor("unexpected")}`);
      }
    });
  }

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
