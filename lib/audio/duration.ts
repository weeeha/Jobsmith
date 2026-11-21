import { readWavInfo } from "./wav";

// Bitrates in kbps by header index, Layer III only.
const BITRATES_MPEG1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_MPEG2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES_MPEG1 = [44_100, 48_000, 32_000];
const RATES_MPEG2 = [22_050, 24_000, 16_000];
const RATES_MPEG25 = [11_025, 12_000, 8_000];

type Frame = { length: number; samples: number; sampleRate: number; mono: boolean; mpeg1: boolean };

function readFrame(b: Uint8Array, at: number): Frame | null {
  if (at + 4 > b.length || b[at] !== 0xff || (b[at + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[at + 1] >> 3) & 3; // 3 = MPEG 1, 2 = MPEG 2, 0 = MPEG 2.5
  const layer = (b[at + 1] >> 1) & 3; // 1 = Layer III
  if (version === 1 || layer !== 1) return null;
  const bitrateIndex = b[at + 2] >> 4;
  const rateIndex = (b[at + 2] >> 2) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const mpeg1 = version === 3;
  const bitrate = (mpeg1 ? BITRATES_MPEG1 : BITRATES_MPEG2)[bitrateIndex] * 1000;
  const sampleRate = (mpeg1 ? RATES_MPEG1 : version === 2 ? RATES_MPEG2 : RATES_MPEG25)[rateIndex];
  const padding = (b[at + 2] >> 1) & 1;
  const length = Math.floor(((mpeg1 ? 144 : 72) * bitrate) / sampleRate) + padding;
  return { length, samples: mpeg1 ? 1152 : 576, sampleRate, mono: b[at + 3] >> 6 === 3, mpeg1 };
}

function id3Size(b: Uint8Array): number {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0;
  const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
  const footer = b[5] & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

// A Xing or Info frame is a table of contents, not audio.
function isInfoFrame(b: Uint8Array, at: number, frame: Frame): boolean {
  const sideInfo = frame.mpeg1 ? (frame.mono ? 17 : 32) : frame.mono ? 9 : 17;
  const tag = String.fromCharCode(...b.subarray(at + 4 + sideInfo, at + 8 + sideInfo));
  return tag === "Xing" || tag === "Info";
}

// Total playing time from the frame headers (MPEG 1, 2 and 2.5, Layer III),
// after skipping an ID3v2 tag. Null when no frame is found.
export function mp3DurationMs(bytes: Uint8Array): number | null {
  let at = id3Size(bytes);
  let seconds = 0;
  let frames = 0;
  while (at + 4 <= bytes.length) {
    const frame = readFrame(bytes, at);
    if (!frame) {
      // Before the first frame, hunt for a sync word; after it, a bad header
      // means trailing data such as an ID3v1 tag, so stop.
      if (frames > 0) break;
      at += 1;
      continue;
    }
    if (!(frames === 0 && isInfoFrame(bytes, at, frame))) {
      seconds += frame.samples / frame.sampleRate;
      frames += 1;
    }
    at += frame.length;
  }
  return frames === 0 ? null : Math.round(seconds * 1000);
}

export function pcmDurationMs(byteLength: number, sampleRate: number): number {
  return Math.round((byteLength / 2 / sampleRate) * 1000);
}

export function wavDurationMs(bytes: Uint8Array): number | null {
  const info = readWavInfo(bytes);
  if (!info.ok) return null;
  const { sampleRate, channels, dataLength } = info.data;
  return Math.round((dataLength / (channels * 2) / sampleRate) * 1000);
}
