import { Mp3Encoder } from "@breezystack/lamejs";

const BLOCK = 1152;
const KBPS = 64;

// Mono MP3 at 64 kbps from 16-bit PCM. Pure JavaScript, no ffmpeg.
export function encodeMp3(pcm: Int16Array, sampleRate: number): Uint8Array {
  const encoder = new Mp3Encoder(1, sampleRate, KBPS);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const chunk = encoder.encodeBuffer(pcm.subarray(i, i + BLOCK));
    if (chunk.length > 0) parts.push(chunk);
  }
  const tail = encoder.flush();
  if (tail.length > 0) parts.push(tail);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
