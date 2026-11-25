import { beforeEach, describe, expect, it, vi } from "vitest";
import * as encode from "@/lib/audio/encode";
import { mp3DurationMs } from "@/lib/audio/duration";
import { prepareClip } from "@/lib/audio/normalize";
import { wrapPcmAsWav } from "@/lib/audio/wav";
import { pcmBytes, sinePcm } from "../helpers/audio";
import { expectFail, expectOk } from "../helpers/result";

vi.mock("@/lib/audio/encode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audio/encode")>();
  return { ...actual, encodeMp3: vi.fn(actual.encodeMp3) };
});

const pcm = sinePcm(1, 24_000);

beforeEach(() => {
  vi.mocked(encode.encodeMp3).mockClear();
});

describe("prepareClip", () => {
  it("an audio/mpeg clip is stored as returned, ext mp3, duration from the frames", () => {
    const mp3 = encode.encodeMp3(pcm, 24_000);
    vi.mocked(encode.encodeMp3).mockClear();
    const clip = expectOk(prepareClip({ audio: mp3, contentType: "audio/mpeg" }));
    expect(clip.bytes).toBe(mp3);
    expect(clip.ext).toBe("mp3");
    expect(clip.contentType).toBe("audio/mpeg");
    expect(clip.durationMs).toBe(mp3DurationMs(mp3));
    expect(encode.encodeMp3).not.toHaveBeenCalled();
  });

  it("an audio/wav clip is encoded to mp3 and its duration comes from the PCM length", () => {
    const clip = expectOk(prepareClip({ audio: wrapPcmAsWav(pcm, 24_000), contentType: "audio/wav" }));
    expect(clip.ext).toBe("mp3");
    expect(clip.contentType).toBe("audio/mpeg");
    expect(clip.durationMs).toBe(1000);
    expect(clip.bytes[0]).toBe(0xff);
    expect(encode.encodeMp3).toHaveBeenCalledTimes(1);
  });

  it("an audio/L16 clip with a sample rate is encoded to mp3", () => {
    const clip = expectOk(
      prepareClip({ audio: pcmBytes(pcm), contentType: "audio/L16;codec=pcm;rate=24000", sampleRate: 24_000 }),
    );
    expect(clip.ext).toBe("mp3");
    expect(clip.durationMs).toBe(1000);
  });

  it("an audio/L16 clip with the rate only in the content type is still encoded", () => {
    const clip = expectOk(prepareClip({ audio: pcmBytes(pcm), contentType: "audio/L16;rate=24000" }));
    expect(clip.ext).toBe("mp3");
  });

  it("an audio/L16 clip with no sample rate anywhere is tts_bad_output", () => {
    expectFail(prepareClip({ audio: pcmBytes(pcm), contentType: "audio/L16" }), "tts_bad_output");
  });

  it("when encoding throws, a wav clip is stored as wav with ext wav", () => {
    vi.mocked(encode.encodeMp3).mockImplementationOnce(() => {
      throw new Error("encoder broke");
    });
    const wav = wrapPcmAsWav(pcm, 24_000);
    const clip = expectOk(prepareClip({ audio: wav, contentType: "audio/wav" }));
    expect(clip.ext).toBe("wav");
    expect(clip.contentType).toBe("audio/wav");
    expect(clip.bytes).toBe(wav);
    expect(clip.durationMs).toBe(1000);
  });

  it("an audio/ogg clip is stored as returned with ext ogg and a null duration", () => {
    const ogg = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]);
    const clip = expectOk(prepareClip({ audio: ogg, contentType: "audio/ogg; codecs=opus" }));
    expect(clip).toMatchObject({ ext: "ogg", durationMs: null });
    expect(clip.contentType).toBe("audio/ogg");
    expect(clip.bytes).toBe(ogg);
  });

  it("an empty body or an unknown content type is tts_bad_output", () => {
    expectFail(prepareClip({ audio: new Uint8Array(0), contentType: "audio/mpeg" }), "tts_bad_output");
    expectFail(prepareClip({ audio: new Uint8Array([1, 2, 3]), contentType: "text/html" }), "tts_bad_output");
    expectFail(prepareClip({ audio: new Uint8Array([1, 2, 3]), contentType: "" }), "tts_bad_output");
  });

  it("a wav body that cannot be parsed is tts_bad_output", () => {
    expectFail(prepareClip({ audio: new Uint8Array([1, 2, 3, 4]), contentType: "audio/wav" }), "tts_bad_output");
  });
});
