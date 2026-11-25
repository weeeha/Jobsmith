import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { bridgeFetch } from "../helpers/bridge-fetch";
import { createApiToken, revokeApiToken } from "@/lib/auth/api-token";
import { defaultStages } from "@/lib/pipeline/rules";
import { run } from "@/cli/src/main";
import { writeCredentials } from "@/cli/src/config";
import type { CliIo } from "@/cli/src/io";
import { MAX_AUDIO_SEGMENTS, MAX_PUSH_BYTES } from "@/lib/bridge/wire";
import { createMemoryStorage } from "@/lib/storage/memory";
import { planSegments } from "@/lib/audio/segments";
import { sourcesForJob } from "@/lib/prep/audio-status";
import { silentMp3 } from "@/lib/tts/fake";
import { wrapPcmAsWav } from "@/lib/audio/wav";
import { sinePcm } from "../helpers/audio";
import { CLI_TTS_IDENTITY } from "@/lib/tts/config";

const BRIDGE = "http://test.local";
const VOICES = { interviewer: "Vivian", candidate: "Ryan" };

type SpeechCall = { path: string; headers: IncomingMessage["headers"]; body: { model: string; input: string; voice: string; response_format: string } };
type SpeechAnswer = (call: SpeechCall) => { status?: number; contentType: string; body: Uint8Array };

const servers: Server[] = [];
afterEach(async () => {
  while (servers.length) {
    const server = servers.pop()!;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function speechServer(answer: SpeechAnswer): Promise<{ url: string; calls: SpeechCall[] }> {
  const calls: SpeechCall[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const call: SpeechCall = { path: req.url ?? "", headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
      calls.push(call);
      const reply = answer(call);
      res.writeHead(reply.status ?? 200, { "content-type": reply.contentType });
      res.end(Buffer.from(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, calls };
}

function mp3Answer(): SpeechAnswer {
  return (call) => ({ contentType: "audio/mpeg", body: silentMp3(Math.max(700, call.body.input.length * 70)) });
}

function setup(db: Db) {
  const revalidated: string[] = [];
  let counter = 0;
  let keys = 0;
  const deps: BridgeDeps = {
    db,
    now: () => new Date(),
    revalidate: (path) => revalidated.push(path),
    requestId: () => `req-${++counter}`,
    audio: {
      storage: createMemoryStorage(new Map()),
      ttsConfig: null,
      randomHex: (bytes) => (++keys).toString(16).padStart(bytes * 2, "0"),
    },
  };
  return deps;
}

async function seedJob(db: Db, email: string, questions: number) {
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const company = await s.company.insert({ name: "Northwind Labs", nameKey: `nw-${email}` });
  const opportunity = await s.opportunity.insert({ companyId: company.id, slug: "nwl-designer", roleTitle: "Product Designer" });
  const stages = await s.stage.insertMany(
    defaultStages().map((d, i) => ({ opportunityId: opportunity.id, kind: d.kind, label: d.label, position: i })),
  );
  await s.opportunity.update(opportunity.id, { currentStageId: stages[0]!.id });
  const artifact = await s.artifact.insert({
    opportunityId: opportunity.id,
    companyId: null,
    stageId: null,
    key: "bank",
    version: 1,
    kind: "question_bank",
    title: "bank",
    bodyMd: "x",
    contentHash: "h",
    sourceHash: "h",
    origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(
    opportunity.id,
    "bank",
    Array.from({ length: questions }, (_, i) => ({
      opportunityId: opportunity.id,
      artifactId: artifact.id,
      artifactVersion: 1,
      artifactKey: "bank",
      number: i + 1,
      position: i,
      question: `Question number ${i + 1}`,
      questionKey: `qk-${i + 1}`,
      blocks: [{ label: "Say", spoken: true, text: `Answer number ${i + 1}` }],
    })),
  );
  const created = await createApiToken(s, "Test");
  if (!created.ok) throw new Error("token setup failed");
  return { s, opportunityId: opportunity.id, token: created.data.token, tokenId: created.data.item.id };
}

// Writes the credentials file the way login would, without a bridge round trip.
async function login(token: string, url = BRIDGE): Promise<Pick<CliIo, "env" | "homedir">> {
  const home = await mkdtemp(path.join(os.tmpdir(), "jobsmith-audio-home-"));
  const env = { XDG_CONFIG_HOME: path.join(home, "config") };
  const io = { fetch: globalThis.fetch, env, cwd: "/", homedir: home, stdout: () => {}, stderr: () => {}, readSecret: async () => "" } satisfies CliIo;
  await writeCredentials(io, { url, token });
  return { env, homedir: home };
}

type Harness = { io: CliIo; out: string[]; err: string[]; requests: { url: URL; method: string; body: string | undefined }[] };

function harness(deps: BridgeDeps, home: Pick<CliIo, "env" | "homedir">, speechBase: string | null, env: Record<string, string> = {}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const requests: Harness["requests"] = [];
  const bridge = bridgeFetch(deps);
  const io: CliIo = {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      requests.push({ url, method: request.method, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.host === "test.local") return bridge(input, init);
      return globalThis.fetch(input, init);
    }) as typeof fetch,
    env: { ...home.env, ...env },
    cwd: "/",
    homedir: home.homedir,
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    readSecret: async () => "",
  };
  void speechBase;
  return { io, out, err, requests };
}

async function done(s: Scoped, opportunityId: string, voices = VOICES) {
  const sources = await sourcesForJob(s, opportunityId, null);
  return planSegments(s, { sources, identity: CLI_TTS_IDENTITY, voices });
}

async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const { db, close } = await makeTestDb();
  try {
    return await fn(db);
  } finally {
    await close();
  }
}

describe("jobsmith audio", () => {
  it("fetches the plan, synthesizes each segment against the speech server and uploads them; the app then holds done segments for every planned hash", () =>
    withDb(async (db) => {
      const { s, opportunityId, token } = await seedJob(db, "ca1@example.com", 3);
      const speech = await speechServer(mp3Answer());
      const h = harness(setup(db), await login(token), speech.url);
      const code = await run(["audio", "nwl-designer", "--tts-url", speech.url], h.io);
      expect(h.err.join("")).toBe("");
      expect(code).toBe(0);
      expect(speech.calls).toHaveLength(6);
      expect(speech.calls.every((c) => c.path === "/v1/audio/speech")).toBe(true);
      const plan = await done(s, opportunityId);
      expect(plan).toMatchObject({ total: 6, done: 6, failed: 0 });
      expect(plan.missing).toHaveLength(0);
      const text = h.out.join("");
      expect(text).toContain("Synthesized 6 of 6 clips.");
      expect(text).toContain("Uploaded 6 clips, 0 already there.");
    }));

  it("a wav answer from the speech server is encoded to mp3 before upload", () =>
    withDb(async (db) => {
      const { s, opportunityId, token } = await seedJob(db, "ca2@example.com", 1);
      const wav = wrapPcmAsWav(sinePcm(1, 16000), 16000);
      const speech = await speechServer(() => ({ contentType: "audio/wav", body: wav }));
      const h = harness(setup(db), await login(token), speech.url);
      expect(await run(["audio", "nwl-designer", "--tts-url", speech.url], h.io)).toBe(0);
      const assets = await s.asset.listAll();
      expect(assets).toHaveLength(2);
      for (const asset of assets) expect(asset.contentType).toBe("audio/mpeg");
      expect((await done(s, opportunityId)).done).toBe(2);
    }));

  it("the speech request carries the plan's model and the voices and no authorization header unless the URL needs one", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "ca3@example.com", 1);
      const speech = await speechServer(mp3Answer());
      const h = harness(setup(db), await login(token), speech.url);
      await run(["audio", "nwl-designer", "--tts-url", speech.url, "--voice-interviewer", "Aria", "--voice-candidate", "Ryan"], h.io);
      const q = speech.calls.find((c) => c.body.input === "Question number 1")!;
      const a = speech.calls.find((c) => c.body.input === "Answer number 1")!;
      expect(q.body).toEqual({ model: CLI_TTS_IDENTITY.model, input: "Question number 1", voice: "Aria", response_format: "mp3" });
      expect(a.body.voice).toBe("Ryan");
      expect(q.headers.authorization).toBeUndefined();
      // The voices reach the upload as query parameters, so the app stores the clips under the same hashes.
      const put = h.requests.find((r) => r.method === "PUT")!;
      expect(put.url.searchParams.get("voice_interviewer")).toBe("Aria");
      expect(put.url.searchParams.get("voice_candidate")).toBe("Ryan");
    }));

  it("sends an authorization header to the speech server only when JOBSMITH_TTS_API_KEY is set", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "ca3b@example.com", 1);
      const speech = await speechServer(mp3Answer());
      const h = harness(setup(db), await login(token), speech.url, { JOBSMITH_TTS_API_KEY: "local-test-key" });
      await run(["audio", "nwl-designer", "--tts-url", speech.url], h.io);
      expect(speech.calls[0]!.headers.authorization).toBe("Bearer local-test-key");
    }));

  it("uploads in batches of at most 50 clips and 4 MB", () =>
    withDb(async (db) => {
      const { s, opportunityId, token } = await seedJob(db, "ca4@example.com", 40);
      const speech = await speechServer(mp3Answer());
      const h = harness(setup(db), await login(token), speech.url);
      expect(await run(["audio", "nwl-designer", "--tts-url", speech.url], h.io)).toBe(0);
      const puts = h.requests.filter((r) => r.method === "PUT");
      expect(puts.length).toBeGreaterThan(1);
      for (const put of puts) {
        expect(JSON.parse(put.body!).segments.length).toBeLessThanOrEqual(MAX_AUDIO_SEGMENTS);
      }
      expect((await done(s, opportunityId)).done).toBe(80);
    }));

  it("splits a request before it passes 4 MB when the clips are large", () =>
    withDb(async (db) => {
      const { s, opportunityId, token } = await seedJob(db, "ca4b@example.com", 4);
      const big = silentMp3(900);
      const padded = new Uint8Array(1_100_000);
      padded.set(big);
      for (let i = 0; i < padded.length; i += 208) padded.set([0xff, 0xfb, 0x50, 0xc0], i);
      const speech = await speechServer(() => ({ contentType: "audio/mpeg", body: padded }));
      const h = harness(setup(db), await login(token), speech.url);
      expect(await run(["audio", "nwl-designer", "--tts-url", speech.url], h.io)).toBe(0);
      const puts = h.requests.filter((r) => r.method === "PUT");
      expect(puts.length).toBeGreaterThan(2);
      for (const put of puts) expect(Buffer.byteLength(put.body!)).toBeLessThanOrEqual(MAX_PUSH_BYTES);
      expect((await done(s, opportunityId)).done).toBe(8);
    }));

  it("a second run uploads nothing: 'Uploaded 0 clips, N already there.'", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "ca5@example.com", 2);
      const speech = await speechServer(mp3Answer());
      const home = await login(token);
      const deps = setup(db);
      await run(["audio", "nwl-designer", "--tts-url", speech.url], harness(deps, home, speech.url).io);
      const before = speech.calls.length;
      const second = harness(deps, home, speech.url);
      expect(await run(["audio", "nwl-designer", "--tts-url", speech.url], second.io)).toBe(0);
      expect(speech.calls.length).toBe(before);
      expect(second.out.join("")).toContain("Uploaded 0 clips, 4 already there.");
      expect(second.requests.some((r) => r.method === "PUT")).toBe(false);
    }));

  it("an unreachable speech server exits 1 with 'Could not reach <url>' and uploads nothing", () =>
    withDb(async (db) => {
      const { s, opportunityId, token } = await seedJob(db, "ca6@example.com", 2);
      const speech = await speechServer(mp3Answer());
      const dead = speech.url;
      await new Promise<void>((resolve) => servers.pop()!.close(() => resolve()));
      const h = harness(setup(db), await login(token), dead);
      expect(await run(["audio", "nwl-designer", "--tts-url", dead], h.io)).toBe(1);
      expect(h.err.join("")).toContain(`Could not reach ${dead}`);
      expect(h.requests.some((r) => r.method === "PUT")).toBe(false);
      expect((await done(s, opportunityId)).done).toBe(0);
    }));

  it("a refused token exits 1 with the same message as pull", () =>
    withDb(async (db) => {
      const { s, token, tokenId } = await seedJob(db, "ca7@example.com", 1);
      const speech = await speechServer(mp3Answer());
      const home = await login(token);
      await revokeApiToken(s, tokenId);
      const h = harness(setup(db), home, speech.url);
      expect(await run(["audio", "nwl-designer", "--tts-url", speech.url], h.io)).toBe(1);
      expect(h.err.join("")).toBe("The server refused the token. Create a new one in Settings and run jobsmith login.\n");
      expect(speech.calls).toHaveLength(0);
    }));

  it("an unknown slug prints the server's message and exits 1", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "ca7b@example.com", 1);
      const speech = await speechServer(mp3Answer());
      const h = harness(setup(db), await login(token), speech.url);
      expect(await run(["audio", "no-such-job", "--tts-url", speech.url], h.io)).toBe(1);
      expect(h.err.join("")).toContain("No job with the slug no-such-job.");
    }));

  it("a clip the speech server refuses is skipped and counted, and the run still exits 0", () =>
    withDb(async (db) => {
      const { s, opportunityId, token } = await seedJob(db, "ca8@example.com", 2);
      const speech = await speechServer((call) =>
        call.body.input === "Answer number 2"
          ? { status: 500, contentType: "text/plain", body: new TextEncoder().encode("boom") }
          : { contentType: "audio/mpeg", body: silentMp3(900) },
      );
      const h = harness(setup(db), await login(token), speech.url);
      expect(await run(["audio", "nwl-designer", "--tts-url", speech.url], h.io)).toBe(0);
      expect(h.out.join("")).toContain("1 clip could not be made");
      expect((await done(s, opportunityId)).done).toBe(3);
    }));

  it("sends the spoken text only to the speech server it was pointed at and to the Jobsmith URL, never anywhere else", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "ca9@example.com", 2);
      const speech = await speechServer(mp3Answer());
      const h = harness(setup(db), await login(token), speech.url);
      await run(["audio", "nwl-designer", "--tts-url", speech.url], h.io);
      const hosts = new Set(h.requests.map((r) => r.url.host));
      expect([...hosts].sort()).toEqual(["test.local", new URL(speech.url).host].sort());
    }));
});
