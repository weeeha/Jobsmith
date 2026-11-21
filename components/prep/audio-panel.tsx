"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteAudioAction, prepareAudioAction } from "@/app/(app)/jobs/[slug]/audio-actions";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FIT_POLL_MAX, FIT_POLL_MS } from "@/lib/fit/card";
import { messageFor } from "@/lib/pipeline/messages";
import { audioStatusText, type AudioStatus } from "@/lib/prep/audio-status";
import { PREP_COPY, VOICE_LINE } from "@/lib/prep/copy";

// After a rate limit the next batch waits a minute (spec 6).
export const AUDIO_PAUSE_MS = 60_000;

type Live =
  | { phase: "running" | "paused"; done: number; total: number; at: string }
  | { phase: "finished"; at: string };

export function AudioPanel(props: {
  opportunityId: string;
  docKey: string | null;
  status: AudioStatus;
  ttsOn: boolean;
}): React.ReactElement {
  const { status, ttsOn } = props;
  const router = useRouter();
  const announce = useAnnounce();
  const [live, setLive] = React.useState<Live | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, startDelete] = React.useTransition();
  const calls = React.useRef(0);
  const alive = React.useRef(true);
  const timer = React.useRef<number | undefined>(undefined);
  // A live state only counts for the server status it was recorded against, so
  // a refresh that brings new numbers wins over it.
  const statusKey = JSON.stringify(status);
  const current = live && live.at === statusKey ? live : null;

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  async function step() {
    if (!alive.current) return;
    calls.current += 1;
    try {
      const result = await prepareAudioAction(props.opportunityId, props.docKey);
      if (!alive.current) return;
      if (!result.ok) {
        toast.error(`${PREP_COPY.audio.prepareFailed} ${result.message}`);
        setLive(null);
        return;
      }
      const { done, total, paused } = result.data;
      if (done >= total) {
        setLive({ phase: "finished", at: statusKey });
        announce(PREP_COPY.audio.readyAnnouncement);
        router.refresh();
        return;
      }
      if (calls.current >= FIT_POLL_MAX) {
        setLive(null);
        router.refresh();
        return;
      }
      setLive({ phase: paused ? "paused" : "running", done, total, at: statusKey });
      timer.current = window.setTimeout(() => void stepRef.current(), paused ? AUDIO_PAUSE_MS : FIT_POLL_MS);
    } catch (error) {
      console.error("prepare audio failed", error);
      if (alive.current) {
        toast.error(`${PREP_COPY.audio.prepareFailed} ${messageFor("unexpected")}`);
        setLive(null);
      }
    }
  }

  // The timer calls the latest step, which closes over the current props.
  const stepRef = React.useRef(step);
  React.useEffect(() => {
    stepRef.current = step;
  });

  function start() {
    calls.current = 0;
    const known = status.state === "partial" ? status : { done: 0, total: 0 };
    setLive({ phase: "running", done: known.done, total: known.total, at: statusKey });
    void step();
  }

  function deleteAudio() {
    startDelete(async () => {
      try {
        const result = await deleteAudioAction();
        if (!result.ok) {
          toast.error(`${PREP_COPY.audio.deleteFailed} ${result.message}`);
          return;
        }
        setConfirmOpen(false);
        announce(PREP_COPY.audio.deletedAnnouncement(result.data.deleted));
        router.refresh();
      } catch (error) {
        console.error("delete audio failed", error);
        toast.error(`${PREP_COPY.audio.deleteFailed} ${messageFor("unexpected")}`);
      }
    });
  }

  const running = current !== null && current.phase !== "finished";
  let line: string;
  if (current?.phase === "finished") line = audioStatusText({ state: "ready" });
  else if (current?.phase === "paused") line = audioStatusText({ state: "paused" });
  else if (current?.phase === "running") line = audioStatusText({ state: "preparing" }, current.done, current.total);
  else line = audioStatusText(status);

  const missing = current?.phase === "finished" ? false : status.state === "partial";
  const hasClips = current?.phase === "finished" || status.state === "ready" || (status.state === "partial" && status.done > 0);
  const browser = status.state === "browser" && current === null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="min-w-0 break-words text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{line}</span>
        {browser ? (
          <>
            {" · "}
            {VOICE_LINE.before}
            <Link
              href="/settings"
              className="rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {VOICE_LINE.link}
            </Link>
            {VOICE_LINE.after}
          </>
        ) : null}
      </p>

      {(ttsOn && missing && !running) || hasClips ? (
        <div className="flex flex-wrap items-center gap-2">
          {ttsOn && missing && !running ? (
            <Button type="button" variant="outline" size="sm" onClick={start}>
              {PREP_COPY.audio.prepare}
            </Button>
          ) : null}
          {hasClips ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
              {PREP_COPY.audio.delete}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{PREP_COPY.audio.deleteTitle}</DialogTitle>
            <DialogDescription>{PREP_COPY.audio.deleteBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="destructive" disabled={deleting} onClick={deleteAudio}>
              {PREP_COPY.audio.deleteConfirm}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {PREP_COPY.audio.deleteCancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
