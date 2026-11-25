// A mono 16-bit sine wave, for audio tests.
export function sinePcm(seconds: number, sampleRate: number, hz = 440): Int16Array {
  const out = new Int16Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / sampleRate) * 12000);
  }
  return out;
}

// Little-endian bytes of 16-bit samples, as raw PCM providers return them.
export function pcmBytes(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length * 2);
  const view = new DataView(out.buffer);
  pcm.forEach((sample, i) => view.setInt16(i * 2, sample, true));
  return out;
}
