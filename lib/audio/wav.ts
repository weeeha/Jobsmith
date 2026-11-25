import { fail, ok, type Result } from "@/lib/result";

const HEADER_BYTES = 44;
const UNKNOWN_SIZE = 0xffffffff;

function writeAscii(view: DataView, at: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
}

function readAscii(bytes: Uint8Array, at: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[at + i] ?? 0);
  return out;
}

// 16-bit mono PCM in a canonical 44-byte RIFF/WAVE container.
export function wrapPcmAsWav(pcm: Int16Array, sampleRate: number): Uint8Array {
  const dataBytes = pcm.length * 2;
  const out = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(out.buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i += 1) view.setInt16(HEADER_BYTES + i * 2, pcm[i], true);
  return out;
}

export type WavInfo = { sampleRate: number; channels: number; dataOffset: number; dataLength: number };

// Reads the header of a 16-bit PCM WAV. A streaming header that leaves the
// data size at 0 or 0xFFFFFFFF means "to the end of the file".
export function readWavInfo(bytes: Uint8Array): Result<WavInfo, "tts_bad_output"> {
  const bad = (why: string) => fail("tts_bad_output", `not a readable WAV: ${why}`);
  if (bytes.length < HEADER_BYTES) return bad("too short");
  if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WAVE") return bad("no RIFF header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: { channels: number; sampleRate: number; bits: number; tag: number } | null = null;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = readAscii(bytes, at, 4);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt ") {
      if (body + 16 > bytes.length) return bad("truncated fmt chunk");
      format = {
        tag: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format) return bad("data before fmt");
      // 0xFFFE is WAVE_FORMAT_EXTENSIBLE, which carries PCM in practice.
      if (format.tag !== 1 && format.tag !== 0xfffe) return bad("not PCM");
      if (format.bits !== 16) return bad("not 16-bit");
      if (format.channels !== 1 && format.channels !== 2) return bad("unsupported channel count");
      if (format.sampleRate < 1) return bad("no sample rate");
      const available = bytes.length - body;
      let length = size;
      if (size === UNKNOWN_SIZE || size === 0) length = available;
      else if (size > available) return bad("truncated data");
      const frame = format.channels * 2;
      length -= length % frame;
      if (length <= 0) return bad("no samples");
      return ok({ sampleRate: format.sampleRate, channels: format.channels, dataOffset: body, dataLength: length });
    }
    at = body + size + (size % 2);
  }
  return bad("no data chunk");
}

export function parseWav(bytes: Uint8Array): Result<{ pcm: Int16Array; sampleRate: number }, "tts_bad_output"> {
  const info = readWavInfo(bytes);
  if (!info.ok) return info;
  const { sampleRate, channels, dataOffset, dataLength } = info.data;
  const view = new DataView(bytes.buffer, bytes.byteOffset + dataOffset, dataLength);
  const frames = dataLength / (channels * 2);
  const pcm = new Int16Array(frames);
  for (let i = 0; i < frames; i += 1) {
    if (channels === 1) pcm[i] = view.getInt16(i * 2, true);
    else pcm[i] = Math.trunc((view.getInt16(i * 4, true) + view.getInt16(i * 4 + 2, true)) / 2);
  }
  return ok({ pcm, sampleRate });
}
