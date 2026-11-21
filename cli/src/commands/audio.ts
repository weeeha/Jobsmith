import { prepareClip } from "@/lib/audio/normalize";
import type { WireAudioPlan, WireAudioRejectReason, WireAudioResult, WireAudioUpload } from "@/lib/bridge/wire";
import { MAX_AUDIO_SEGMENTS, MAX_PUSH_BYTES } from "@/lib/bridge/wire";
import { DEFAULT_CLI_TTS_URL } from "@/lib/tts/config";
import { bridgeRequest, extractServerMessage, parseJson } from "../http";
import type { Command } from "../args";
import type { CliIo } from "../io";

const SPEECH_TIMEOUT_MS = 120_000;
// Room for the JSON around the clips, so a request never passes the server's cap.
const REQUEST_MARGIN_BYTES = 4_096;
const CLIP_OVERHEAD_BYTES = 160;
const PROGRESS_EVERY = 10;

type Creds = { url: string; token: string };
type Clip = WireAudioUpload["segments"][number];

const REFUSED = "The server refused the token. Create a new one in Settings and run jobsmith login.\n";

type SpeechResult =
  | { kind: "clip"; clip: Omit<Clip, "hash"> }
  | { kind: "skipped"; message: string }
  | { kind: "unreachable"; message: string };

async function synthesize(
  io: CliIo,
  speechUrl: string,
  plan: WireAudioPlan,
  segment: WireAudioPlan["segments"][number],
): Promise<SpeechResult> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = io.env.JOBSMITH_TTS_API_KEY;
  if (key) headers.authorization = `Bearer ${key}`;
  let response: Response;
  try {
    response = await io.fetch(`${speechUrl}/audio/speech`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: plan.identity.model,
        input: segment.text,
        voice: plan.voices[segment.speaker],
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
    });
  } catch (error) {
    return { kind: "unreachable", message: error instanceof Error ? error.message : String(error) };
  }
  if (response.status !== 200) {
    await response.arrayBuffer().catch(() => undefined);
    return { kind: "skipped", message: `the speech server answered ${response.status}` };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const prepared = prepareClip({ audio: bytes, contentType: response.headers.get("content-type") ?? "audio/mpeg" });
  if (!prepared.ok) return { kind: "skipped", message: prepared.message };
  return {
    kind: "clip",
    clip: {
      contentType: prepared.data.contentType,
      durationMs: Math.round(prepared.data.durationMs ?? 0),
      base64: Buffer.from(prepared.data.bytes).toString("base64"),
    },
  };
}

export async function runAudio(
  io: CliIo,
  creds: Creds,
  command: Extract<Command, { name: "audio" }>,
): Promise<number> {
  const speechUrl = command.ttsUrl ?? DEFAULT_CLI_TTS_URL;
  const base = `/api/bridge/opportunities/${encodeURIComponent(command.slug)}/audio`;

  const planQuery = new URLSearchParams();
  if (command.voiceInterviewer) planQuery.set("voice_interviewer", command.voiceInterviewer);
  if (command.voiceCandidate) planQuery.set("voice_candidate", command.voiceCandidate);
  const suffix = planQuery.size > 0 ? `?${planQuery}` : "";

  // Reads a bridge reply the same way pull and push do; null means it was handled.
  async function bridge<T>(method: "GET" | "PUT", path: string, body?: unknown): Promise<{ value: T } | { exit: number }> {
    const response = await bridgeRequest(io, creds, method, path, body);
    if (!response.ok) {
      io.stderr(`Could not reach ${creds.url}: ${response.message}.\n`);
      return { exit: 1 };
    }
    if (response.status === 401) {
      io.stderr(REFUSED);
      return { exit: 1 };
    }
    if (response.status !== 200) {
      io.stderr(`Error: ${extractServerMessage(response.text)}\n`);
      return { exit: 1 };
    }
    const parsed = parseJson(response.text);
    if (!parsed.ok) {
      io.stderr("Error: the server sent a reply the CLI could not read.\n");
      return { exit: 1 };
    }
    return { value: parsed.value as T };
  }

  const planned = await bridge<WireAudioPlan>("GET", `${base}/plan${suffix}`);
  if ("exit" in planned) return planned.exit;
  const plan = planned.value;

  // The upload carries the plan's voices, so the app stores the clips under
  // the hashes the plan listed.
  const uploadQuery = new URLSearchParams({ voice_interviewer: plan.voices.interviewer, voice_candidate: plan.voices.candidate });
  let stored = 0;
  let skipped = plan.done;
  const rejected: { hash: string; reason: WireAudioRejectReason }[] = [];
  let batch: Clip[] = [];
  let batchBytes = REQUEST_MARGIN_BYTES;

  async function flush(): Promise<number | null> {
    if (batch.length === 0) return null;
    const sending = batch;
    batch = [];
    batchBytes = REQUEST_MARGIN_BYTES;
    const sent = await bridge<WireAudioResult>("PUT", `${base}?${uploadQuery}`, { segments: sending });
    if ("exit" in sent) return sent.exit;
    stored += sent.value.stored;
    skipped += sent.value.skipped;
    rejected.push(...sent.value.rejected);
    return null;
  }

  let made = 0;
  let failed = 0;
  let unreachable: string | null = null;
  for (const segment of plan.segments) {
    const result = await synthesize(io, speechUrl, plan, segment);
    if (result.kind === "unreachable") {
      unreachable = result.message;
      break;
    }
    if (result.kind === "skipped") {
      failed += 1;
      continue;
    }
    const clip: Clip = { hash: segment.hash, ...result.clip };
    const size = clip.base64.length + CLIP_OVERHEAD_BYTES;
    if (batch.length > 0 && (batch.length >= MAX_AUDIO_SEGMENTS || batchBytes + size > MAX_PUSH_BYTES)) {
      const exit = await flush();
      if (exit !== null) return exit;
    }
    batch.push(clip);
    batchBytes += size;
    made += 1;
    if (made % PROGRESS_EVERY === 0) io.stdout(`Synthesized ${made} of ${plan.segments.length} clips.\n`);
  }

  // What was made before a failure is still worth keeping.
  const exit = await flush();
  if (exit !== null) return exit;

  if (unreachable !== null) {
    io.stderr(`Could not reach ${speechUrl}: ${unreachable}.\n`);
    return 1;
  }

  if (made % PROGRESS_EVERY !== 0 || made === 0) io.stdout(`Synthesized ${made} of ${plan.segments.length} clips.\n`);
  io.stdout(`Uploaded ${stored} clips, ${skipped} already there.\n`);
  if (failed > 0) io.stdout(`${failed} ${failed === 1 ? "clip" : "clips"} could not be made. Run the command again to retry.\n`);
  if (rejected.length > 0) {
    io.stdout(`${rejected.length} ${rejected.length === 1 ? "clip was" : "clips were"} refused by the server.\n`);
  }
  return 0;
}
