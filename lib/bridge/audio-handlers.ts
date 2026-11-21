import { audioUploadSchema, firstAudioIssue } from "./audio-schema";
import { authenticate, isValidSlugShape, logBridgeError, type BridgeDeps } from "./handlers";
import { bridgeError, bridgeJson, readJsonCapped } from "./http";
import { MAX_AUDIO_SEGMENTS, MAX_PUSH_BYTES, type WireAudioPlan, type WireAudioRejectReason, type WireAudioResult } from "./wire";
import { planSegments, plannedHashes, storeUploaded } from "@/lib/audio/segments";
import type { Scoped } from "@/lib/db/scoped";
import { sourcesForJob } from "@/lib/prep/audio-status";
import { getPrepSettings, resolveVoices } from "@/lib/prep/settings";
import { SEGMENT_MAX_BYTES } from "@/lib/prep/values";
import { ttsIdentity } from "@/lib/tts/config";
import { TTS_STYLE_ID } from "@/lib/tts/driver";

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

// The voices of one request: the query wins, then the saved settings, then the
// provider-less defaults (the CLI knows its own server's voices; the plan
// carries them back so the upload is stored under the same hashes).
async function requestVoices(s: Scoped, url: URL): Promise<{ interviewer: string; candidate: string }> {
  const settings = await getPrepSettings(s);
  const resolved = resolveVoices(settings, []);
  const pick = (name: string, fallback: string) => {
    const value = url.searchParams.get(name)?.trim();
    return value && value.length <= 200 ? value : fallback;
  };
  return { interviewer: pick("voice_interviewer", resolved.interviewer), candidate: pick("voice_candidate", resolved.candidate) };
}

export async function handleAudioPlan(deps: BridgeDeps, request: Request, slug: string): Promise<Response> {
  const requestId = deps.requestId();
  try {
    const auth = await authenticate(deps, request, requestId, deps.now());
    if (!auth.ok) return auth.response;
    if (!deps.audio) return bridgeError("server_error", requestId);
    if (!isValidSlugShape(slug)) return bridgeError("not_found", requestId, { slug });
    const opportunity = await auth.s.opportunity.getBySlug(slug);
    if (!opportunity) return bridgeError("not_found", requestId, { slug });

    const identity = ttsIdentity(deps.audio.ttsConfig);
    const voices = await requestVoices(auth.s, new URL(request.url));
    const sources = await sourcesForJob(auth.s, opportunity.id, null);
    const plan = await planSegments(auth.s, { sources, identity, voices, includeFailed: true });
    const body: WireAudioPlan = {
      identity: { ...identity, style: TTS_STYLE_ID },
      voices,
      total: plan.total,
      done: plan.done,
      segments: plan.missing.map((m) => ({ hash: m.hash, speaker: m.speaker, text: m.text })),
      requestId,
    };
    return bridgeJson(body, { requestId });
  } catch (error) {
    logBridgeError(requestId, error);
    return bridgeError("server_error", requestId);
  }
}

export async function handleAudioUpload(deps: BridgeDeps, request: Request, slug: string): Promise<Response> {
  const requestId = deps.requestId();
  try {
    const now = deps.now();
    const auth = await authenticate(deps, request, requestId, now);
    if (!auth.ok) return auth.response;
    if (!deps.audio) return bridgeError("server_error", requestId);
    if (!isValidSlugShape(slug)) return bridgeError("not_found", requestId, { slug });
    const opportunity = await auth.s.opportunity.getBySlug(slug);
    if (!opportunity) return bridgeError("not_found", requestId, { slug });

    const bodyResult = await readJsonCapped(request, MAX_PUSH_BYTES);
    if (!bodyResult.ok) return bridgeError(bodyResult.code, requestId);

    // Peek at the length before the full schema runs, as push does.
    const raw = bodyResult.data;
    if (
      typeof raw === "object" &&
      raw !== null &&
      Array.isArray((raw as { segments?: unknown }).segments) &&
      (raw as { segments: unknown[] }).segments.length > MAX_AUDIO_SEGMENTS
    ) {
      return bridgeError("too_many_segments", requestId);
    }
    const parsed = audioUploadSchema.safeParse(raw);
    if (!parsed.success) return bridgeError("invalid_payload", requestId, { text: firstAudioIssue(parsed.error) });

    // A clip that cannot be decoded or is too big is refused on its own; the
    // rest of the request still goes through.
    const rejected: { hash: string; reason: WireAudioRejectReason }[] = [];
    const uploads: { hash: string; contentType: string; durationMs: number | null; bytes: Uint8Array }[] = [];
    for (const item of parsed.data.segments) {
      if (item.base64.length % 4 !== 0 || !BASE64.test(item.base64)) {
        rejected.push({ hash: item.hash, reason: "bad_base64" });
        continue;
      }
      // Checked from the text's length, so an oversize clip is never decoded.
      if ((item.base64.length / 4) * 3 > SEGMENT_MAX_BYTES + 2) {
        rejected.push({ hash: item.hash, reason: "too_large" });
        continue;
      }
      uploads.push({ hash: item.hash, contentType: item.contentType, durationMs: item.durationMs, bytes: new Uint8Array(Buffer.from(item.base64, "base64")) });
    }

    const identity = ttsIdentity(deps.audio.ttsConfig);
    const voices = await requestVoices(auth.s, new URL(request.url));
    const sources = await sourcesForJob(auth.s, opportunity.id, null);
    const result = await storeUploaded(
      auth.s,
      { tts: null, storage: deps.audio.storage, now: deps.now, randomHex: deps.audio.randomHex },
      { identity, voices, plannedHashes: plannedHashes(sources, identity, voices), uploads },
    );
    if (result.stored > 0) deps.revalidate(`/jobs/${slug}`);

    const body: WireAudioResult = {
      stored: result.stored,
      skipped: result.skipped,
      rejected: [...rejected, ...result.rejected],
      requestId,
    };
    return bridgeJson(body, { requestId });
  } catch (error) {
    logBridgeError(requestId, error);
    return bridgeError("server_error", requestId);
  }
}
