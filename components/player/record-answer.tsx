"use client";

import * as React from "react";
import { toast } from "sonner";

import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { PREP_COPY } from "@/lib/prep/copy";

// The slices of MediaRecorder and getUserMedia the control uses, so tests hand
// it stubs and a browser that lacks one of them hides the control.
export interface RecorderLike {
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
}
export interface StreamLike {
  getTracks(): { stop(): void }[];
}
export type MediaEnv = {
  getUserMedia: (() => Promise<StreamLike>) | null;
  createRecorder: ((stream: StreamLike) => RecorderLike) | null;
};

/** The real browser, with each API feature-detected. */
export function browserMediaEnv(): MediaEnv {
  if (typeof window === "undefined") return { getUserMedia: null, createRecorder: null };
  const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  const getUserMedia =
    devices && typeof devices.getUserMedia === "function"
      ? () => devices.getUserMedia({ audio: true }) as Promise<StreamLike>
      : null;
  const createRecorder =
    typeof window.MediaRecorder === "function"
      ? (stream: StreamLike) => new window.MediaRecorder(stream as MediaStream) as unknown as RecorderLike
      : null;
  return { getUserMedia, createRecorder };
}

export type UploadInput = { blob: Blob; opportunityId: string; sessionId: string; questionKey: string };
export type UploadResult = { ok: true } | { ok: false; message: string };

export async function uploadRecording(input: UploadInput): Promise<UploadResult> {
  const form = new FormData();
  form.set("opportunityId", input.opportunityId);
  form.set("sessionId", input.sessionId);
  form.set("questionKey", input.questionKey);
  form.set("file", input.blob, "answer");
  try {
    const response = await fetch("/api/assets", { method: "POST", body: form });
    if (response.status === 201) return { ok: true };
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, message: body?.error ?? PREP_COPY.drill.record.saveFailed };
  } catch {
    return { ok: false, message: PREP_COPY.drill.record.saveFailed };
  }
}

type Status = "idle" | "requesting" | "recording" | "recorded" | "kept" | "discarded";

export type AnswerRecorder = {
  available: boolean;
  refused: boolean;
  status: Status;
  url: string | null;
  saving: boolean;
  begin(): void;
  keep(): void;
  discard(): void;
};

/**
 * The recording state for one question. The microphone is asked for on
 * `begin` (a click), recording stops when the phase turns to "reveal", and
 * the result stays on the device until `keep`. A refusal is reported through
 * `onRefused`; the parent holds it and passes `refused` back in.
 */
export function useAnswerRecorder(props: {
  phase: "gap" | "reveal";
  opportunityId: string;
  sessionId: string | null;
  questionKey: string;
  refused: boolean;
  onRefused(): void;
  env?: MediaEnv;
  upload?: (input: UploadInput) => Promise<UploadResult>;
}): AnswerRecorder {
  const { phase, onRefused } = props;
  const copy = PREP_COPY.drill.record;
  const announce = useAnnounce();
  const envRef = React.useRef<MediaEnv | null>(props.env ?? null);
  const getEnv = React.useCallback((): MediaEnv => (envRef.current ??= browserMediaEnv()), []);
  const [status, setStatus] = React.useState<Status>("idle");
  const [blob, setBlob] = React.useState<Blob | null>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const recorderRef = React.useRef<RecorderLike | null>(null);
  const streamRef = React.useRef<StreamLike | null>(null);
  const phaseRef = React.useRef(phase);
  const chunks = React.useRef<Blob[]>([]);
  React.useEffect(() => {
    phaseRef.current = phase;
  });

  const release = React.useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  // Stops the recorder; with `keepChunks` the chunks become the recording.
  const finish = React.useCallback(
    (keepChunks: boolean) => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (!recorder) {
        release();
        return;
      }
      recorder.onstop = () => {
        release();
        if (!keepChunks || chunks.current.length === 0) return;
        const made = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" });
        chunks.current = [];
        setBlob(made);
        setUrl(URL.createObjectURL(made));
        setStatus("recorded");
      };
      recorder.stop();
    },
    [release],
  );

  const begin = React.useCallback(async () => {
    const env = getEnv();
    if (!env.getUserMedia || !env.createRecorder) return;
    setStatus("requesting");
    let stream: StreamLike;
    try {
      stream = await env.getUserMedia();
    } catch {
      setStatus("idle");
      onRefused();
      return;
    }
    streamRef.current = stream;
    const recorder = env.createRecorder(stream);
    chunks.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    recorderRef.current = recorder;
    recorder.start();
    // The gap ended while the permission prompt was open: nothing to record.
    if (phaseRef.current === "reveal") {
      finish(false);
      setStatus("idle");
      return;
    }
    setStatus("recording");
  }, [getEnv, onRefused, finish]);

  // Recording stops at the reveal.
  React.useEffect(() => {
    if (phase === "reveal" && status === "recording") finish(true);
  }, [phase, status, finish]);

  // Leaving the question drops everything and lets the microphone go.
  React.useEffect(
    () => () => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.stop();
      }
      release();
    },
    [release],
  );
  React.useEffect(() => {
    if (url === null) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  const env = getEnv();
  const available = env.getUserMedia !== null && env.createRecorder !== null && props.sessionId !== null;
  const { sessionId, opportunityId, questionKey, upload } = props;

  const keep = React.useCallback(async () => {
    if (!blob || sessionId === null) return;
    setSaving(true);
    const result = await (upload ?? uploadRecording)({ blob, opportunityId, sessionId, questionKey });
    setSaving(false);
    if (result.ok) {
      setStatus("kept");
      announce(copy.saved);
    } else {
      toast.error(result.message);
    }
  }, [blob, sessionId, opportunityId, questionKey, upload, announce, copy.saved]);

  const discard = React.useCallback(() => {
    setBlob(null);
    setUrl(null);
    setStatus("discarded");
  }, []);

  return {
    available,
    refused: props.refused,
    status,
    url,
    saving,
    begin: () => void begin(),
    keep: () => void keep(),
    discard,
  };
}

/** The gap's part: the Record my answer button, then the "Recording" line. */
export function RecordControl({ recorder }: { recorder: AnswerRecorder }): React.ReactElement | null {
  const copy = PREP_COPY.drill.record;
  if (recorder.refused) return <p className="text-xs text-muted-foreground">{copy.refused}</p>;
  if (!recorder.available) return null;
  if (recorder.status === "idle" || recorder.status === "requesting") {
    return (
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="min-h-11"
        disabled={recorder.status === "requesting"}
        onClick={recorder.begin}
      >
        {copy.button}
      </Button>
    );
  }
  if (recorder.status === "recording") {
    return (
      <p role="status" className="text-sm text-foreground">
        {copy.recording}
      </p>
    );
  }
  return null;
}

/** The reveal's part: the recording to play, with Keep and Discard. */
export function RecordedPanel({ recorder }: { recorder: AnswerRecorder }): React.ReactElement | null {
  const copy = PREP_COPY.drill.record;
  if (recorder.refused || !recorder.available) return null;
  if (recorder.status === "recorded" && recorder.url) {
    return (
      <section aria-label={copy.yourRecording} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">{copy.yourRecording}</p>
        <audio controls src={recorder.url} className="w-full" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="lg" className="min-h-11" disabled={recorder.saving} onClick={recorder.keep}>
            {copy.keep}
          </Button>
          <Button type="button" variant="outline" size="lg" className="min-h-11" disabled={recorder.saving} onClick={recorder.discard}>
            {copy.discard}
          </Button>
        </div>
      </section>
    );
  }
  if (recorder.status === "kept") return <p className="text-sm text-muted-foreground">{copy.saved}</p>;
  return null;
}

/** Both parts in one place, for a screen that does not split them. */
export function RecordAnswer(props: Parameters<typeof useAnswerRecorder>[0]): React.ReactElement | null {
  const recorder = useAnswerRecorder(props);
  return props.phase === "gap" ? <RecordControl recorder={recorder} /> : <RecordedPanel recorder={recorder} />;
}
