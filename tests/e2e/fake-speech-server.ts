import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { silentMp3 } from "../../lib/tts/fake";

export type SpeechCall = { authorization: string | undefined; model: string; voice: string; input: string };

/**
 * A stand-in for an OpenAI-compatible speech server (Qwen3-TTS and the like):
 * POST /v1/audio/speech answers a silent MP3. It only listens on 127.0.0.1 and
 * records what it was asked, so a spec can check where the text went.
 */
export async function startFakeSpeechServer(): Promise<{ baseUrl: string; calls: SpeechCall[]; close(): Promise<void> }> {
  const calls: SpeechCall[] = [];
  const server: Server = createServer((req: IncomingMessage, res) => {
    if (req.method !== "POST" || req.url !== "/v1/audio/speech") {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { model: string; voice: string; input: string };
      calls.push({ authorization: req.headers.authorization, model: body.model, voice: body.voice, input: body.input });
      const audio = silentMp3(1500);
      res.writeHead(200, { "content-type": "audio/mpeg", "content-length": audio.length });
      res.end(Buffer.from(audio));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
