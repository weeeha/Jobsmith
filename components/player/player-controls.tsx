"use client";

import * as React from "react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { PREP_COPY } from "@/lib/prep/copy";
import { SPEED_MAX, SPEED_MIN } from "@/lib/prep/settings";

export const SPEED_OPTIONS: number[] = Array.from({ length: Math.round((SPEED_MAX - SPEED_MIN) * 10) + 1 }, (_, i) =>
  Math.round((SPEED_MIN + i / 10) * 10) / 10,
);

export function PlayerControls(props: {
  playing: boolean;
  speed: number;
  chapters: boolean;
  onPlay(): void;
  onPause(): void;
  onPrevious(): void;
  onNext(): void;
  onRepeat(): void;
  onSpeed(speed: number): void;
}): React.ReactElement {
  const copy = PREP_COPY.listen;
  const speedId = React.useId();
  const touch = "size-11";
  return (
    <div role="group" aria-label={copy.transport} className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className={touch}
        aria-label={props.chapters ? copy.previousChapter : copy.previous}
        onClick={props.onPrevious}
      >
        <SkipBack aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-lg"
        className={touch}
        aria-label={props.playing ? copy.pause : copy.play}
        onClick={props.playing ? props.onPause : props.onPlay}
      >
        {props.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className={touch}
        aria-label={props.chapters ? copy.nextChapter : copy.next}
        onClick={props.onNext}
      >
        <SkipForward aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className={touch}
        aria-label={props.chapters ? copy.repeatChapter : copy.repeat}
        onClick={props.onRepeat}
      >
        <RotateCcw aria-hidden="true" />
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <label htmlFor={speedId} className="text-sm text-muted-foreground">
          {copy.speed}
        </label>
        <NativeSelect id={speedId} value={String(props.speed)} onChange={(e) => props.onSpeed(Number(e.target.value))}>
          {SPEED_OPTIONS.map((speed) => (
            <option key={speed} value={String(speed)}>
              {copy.speedValue(speed)}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
