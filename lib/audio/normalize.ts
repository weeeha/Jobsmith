import { fail, ok, type Result } from "@/lib/result";
import type { TtsAudio } from "@/lib/tts/driver";
import { mp3DurationMs, pcmDurationMs, wavDurationMs } from "./duration";
import { encodeMp3 } from "./encode";
import { parseWav } from "./wav";

export type PreparedClip = {
  bytes: Uint8Array;
  contentType: string;
  ext: "mp3" | "wav" | "ogg";
  durationMs: number | null;
};

const MP3_TYPES = ["audio/mpeg", "audio/mp3"];
const WAV_TYPES = ["audio/wav", "audio/wave", "audio/x-wav", "audio/vnd.wave"];
const PCM_TYPES = ["audio/l16", "audio/pcm"];
const OGG_TYPES = ["audio/ogg", "audio/opus"];

function bad(message: string) {
  return fail("tts_bad_output", message);
}

// Raw PCM is read as 16-bit little-endian, which is what Gemini and the local
// servers send; the rate comes from the driver or from a `rate=` parameter.
function pcmFromBytes(bytes: Uint8Array): Int16Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pcm = new Int16Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < pcm.length; i += 1) pcm[i] = view.getInt16(i * 2, true);
  return pcm;
}

function mp3Clip(pcm: Int16Array, sampleRate: number): Result<PreparedClip, "tts_bad_output"> {
  try {
    const bytes = encodeMp3(pcm, sampleRate);
    if (bytes.length === 0) return bad("encoder returned no audio");
    return ok({
      bytes,
      contentType: "audio/mpeg",
      ext: "mp3",
      durationMs: pcmDurationMs(pcm.length * 2, sampleRate),
    });
  } catch {
    return bad("encoder failed");
  }
}

// Turns what a provider returned into what gets stored: PCM and WAV become a
// mono MP3, MP3 and Opus are kept as returned, anything else is refused.
export function prepareClip(audio: TtsAudio): Result<PreparedClip, "tts_bad_output"> {
  if (audio.audio.length === 0) return bad("empty audio");
  const [rawType, ...params] = audio.contentType.split(";");
  const type = rawType.trim().toLowerCase();

  if (MP3_TYPES.includes(type)) {
    return ok({ bytes: audio.audio, contentType: "audio/mpeg", ext: "mp3", durationMs: mp3DurationMs(audio.audio) });
  }
  if (OGG_TYPES.includes(type)) {
    return ok({ bytes: audio.audio, contentType: "audio/ogg", ext: "ogg", durationMs: null });
  }
  if (WAV_TYPES.includes(type)) {
    const wav = parseWav(audio.audio);
    if (!wav.ok) return wav;
    const encoded = mp3Clip(wav.data.pcm, wav.data.sampleRate);
    if (encoded.ok) return encoded;
    // Keep the original rather than lose the clip.
    return ok({ bytes: audio.audio, contentType: "audio/wav", ext: "wav", durationMs: wavDurationMs(audio.audio) });
  }
  if (PCM_TYPES.includes(type)) {
    const fromType = params
      .map((p) => /^\s*rate\s*=\s*(\d+)\s*$/i.exec(p)?.[1])
      .find((rate) => rate !== undefined);
    const sampleRate = audio.sampleRate ?? (fromType ? Number(fromType) : undefined);
    if (!sampleRate || sampleRate < 1) return bad("raw PCM without a sample rate");
    const pcm = pcmFromBytes(audio.audio);
    if (pcm.length === 0) return bad("empty audio");
    return mp3Clip(pcm, sampleRate);
  }
  return bad("unsupported audio type");
}
