"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { PREP_COPY } from "@/lib/prep/copy";
import type { PlaybackPlan } from "@/lib/prep/plan";
import { cn } from "@/lib/utils";

/**
 * The current question's blocks. The playing block carries aria-current, a tap
 * seeks to its first step, a note block is dimmed and has no step. A block
 * with a step that has no clip says "Browser voice"; a suspect clip says
 * "Check this clip" and offers Regenerate.
 */
export function Transcript(props: {
  plan: PlaybackPlan;
  questionIndex: number;
  currentStepIndex: number;
  onSeek(stepIndex: number): void;
  onRegenerate(hashes: string[]): void;
  regenerating: boolean;
}): React.ReactElement | null {
  const { plan, questionIndex } = props;
  const question = plan.questions[questionIndex];
  const baseId = React.useId();
  if (!question) return null;

  const steps = plan.steps.map((step, index) => ({ step, index })).filter((s) => s.step.questionIndex === questionIndex);
  const playing = plan.steps[props.currentStepIndex];
  const playingBlock = playing && playing.questionIndex === questionIndex ? playing.blockIndex : null;
  const questionClipMissing = steps.some((s) => s.step.blockIndex === null && s.step.clip === null);

  return (
    <section aria-label={PREP_COPY.listen.transcript} className="flex min-w-0 flex-col gap-3">
      <h2 className="break-words text-lg font-semibold text-foreground">{question.question}</h2>
      {questionClipMissing ? <p className="text-xs text-muted-foreground">{PREP_COPY.listen.browserVoice}</p> : null}
      <ul className="flex flex-col gap-3">
        {question.blocks.map((block) => {
          const own = steps.filter((s) => s.step.blockIndex === block.index);
          const label = block.label.trim();
          const heading = label === "" ? null : label.endsWith(":") ? label : `${label}:`;

          if (!block.spoken || own.length === 0) {
            return (
              <li key={block.index} data-note="" className="flex flex-col gap-1 rounded-lg border border-dashed border-border px-3 py-2">
                {heading ? <span className="text-xs font-medium text-muted-foreground">{heading}</span> : null}
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{block.text}</p>
              </li>
            );
          }

          const isPlaying = playingBlock === block.index;
          const browser = own.some((s) => s.step.clip === null);
          const suspect = own.filter((s) => s.step.clip?.suspect);
          const textId = `${baseId}-${block.index}`;
          return (
            <li key={block.index} className="flex flex-col gap-1">
              <button
                type="button"
                id={textId}
                aria-current={isPlaying ? "true" : undefined}
                onClick={() => props.onSeek(own[0].index)}
                className={cn(
                  "flex w-full min-w-0 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isPlaying ? "border-ring bg-muted" : "border-border bg-card hover:bg-muted",
                )}
              >
                {heading ? <span className="text-xs font-medium text-muted-foreground">{heading}</span> : null}
                <span className="whitespace-pre-wrap break-words text-sm text-foreground">{block.text}</span>
              </button>
              {browser || suspect.length > 0 ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                  {browser ? <span className="text-xs text-muted-foreground">{PREP_COPY.listen.browserVoice}</span> : null}
                  {suspect.length > 0 ? (
                    <>
                      <span className="text-xs text-foreground">{PREP_COPY.listen.checkClip}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        aria-describedby={textId}
                        disabled={props.regenerating}
                        onClick={() => props.onRegenerate([...new Set(suspect.map((s) => s.step.hash))])}
                      >
                        {props.regenerating ? PREP_COPY.listen.regenerating : PREP_COPY.listen.regenerate}
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
