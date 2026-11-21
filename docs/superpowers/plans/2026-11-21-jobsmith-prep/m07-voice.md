# Milestone 7: Voice

> Done when: "A bank plays end to end in two voices on desktop and phone from the fake driver in CI, and from the local Qwen3-TTS server through the CLI on the owner's machine" (spec section 9).

Branch: `feat/m07-voice`, cut from `main` after Milestone 6 has merged. Tasks 15 to 31.

**Before starting.** Milestone 6 must be merged:

```bash
test -f lib/prep/parse.ts && test -f lib/prep/rebuild.ts && test -f lib/prep/marks.ts \
  && test -f lib/db/scoped/tts-segment.ts && test -f lib/db/scoped/asset.ts \
  && test -f components/prep/mark-buttons.tsx && test -f lib/prep/hub.ts && echo m6-ok
```

If a file is missing, stop: Milestone 7 builds on the six tables, the hub and the mark buttons. Nothing is left out for a missing dependency. Read `node_modules/next/dist/docs/` for route handlers (streaming and `Response` bodies) before Task 24.

Names used by other plans: `Storage`, `userHash`, `userPrefix`, `STORAGE_PROVIDER`, `STORAGE_LOCAL_DIR`, the `S3_*` variables and `BLOB_READ_WRITE_TOKEN` are read by the Hosted and Widen plans. Keep their spelling.

---

### Task 15: Storage interface, keys, config, memory and local drivers

**Files:**
- Create: `lib/storage/driver.ts`, `lib/storage/keys.ts`, `lib/storage/config.ts`, `lib/storage/memory.ts`, `lib/storage/local.ts`, `lib/storage/index.ts`
- Modify: `lib/env.ts` (`Env.STORAGE: StorageConfig`, parsed by `parseStorageConfig`; an invalid result joins `EnvError`'s name list as `parseAiConfig` does), `.gitignore` (`/.data/`)
- Test: `tests/unit/storage-keys.test.ts`, `tests/unit/storage-config.test.ts`, `tests/unit/storage-drivers.test.ts`, `tests/unit/env.test.ts` (extend)

**Interfaces:**
- Consumes: `node:crypto`, `node:fs/promises`, `Env` and `parseEnv` in `lib/env.ts`.
- Produces: `Storage`, `StorageError` (README Contract); `userHash`, `userPrefix`, `newSegmentKey`, `newRecordingKey`, `STORAGE_KEY_PATTERN` (`/^u\/[0-9a-f]{16}\/(tts|rec)\/[0-9a-f]{32}\.(mp3|wav|ogg|webm|mp4)$/`); `createMemoryStorage(): Storage`; `createLocalStorage(dir: string): Storage`; `getStorage(): Storage` (cached, reads `env().STORAGE`; the `s3` and `vercel_blob` cases are added in Task 16);

```ts
export type StorageConfig =
  | { provider: "local"; dir: string }
  | { provider: "memory" }
  | { provider: "s3"; endpoint: string | null; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean }
  | { provider: "vercel_blob"; token: string };
export function parseStorageConfig(source: Record<string, string | undefined>): { ok: true; config: StorageConfig } | { ok: false; invalid: string[] };
```

- [ ] **Step 1: Write the failing tests**

```ts
// storage-keys.test.ts
it("userHash is the first 16 hex characters of sha256 of the user id");               // computed in the test
it("userPrefix is 'u/<hash>/'");
it("newSegmentKey matches u/<16 hex>/tts/<32 hex>.mp3 and never contains the user id or any text");
it("newRecordingKey matches u/<16 hex>/rec/<32 hex>.webm");
it("two calls never return the same key");
it("STORAGE_KEY_PATTERN rejects '../x', an absolute path, a missing prefix and an unknown extension");
// storage-config.test.ts
it("defaults to local with dir .data/storage when STORAGE_PROVIDER is unset");
it("STORAGE_LOCAL_DIR overrides the directory");
it("refuses local when VERCEL is set, naming STORAGE_PROVIDER");
it("s3 needs S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY; S3_ENDPOINT is optional; S3_FORCE_PATH_STYLE=true sets forcePathStyle");
it("vercel_blob needs BLOB_READ_WRITE_TOKEN");
it("memory is refused when NODE_ENV is production");
it("an unknown provider is invalid");
// storage-drivers.test.ts: one contract suite, run for createMemoryStorage() and createLocalStorage(tmpdir)
it("put then get returns the same bytes");
it("get of a missing key returns null");
it("put overwrites an existing key");
it("delete removes the object and deleting a missing key does not throw");
it("local rejects a key that does not match STORAGE_KEY_PATTERN with StorageError, before touching the disk");
it("local writes through a temporary file so a reader never sees half an object");
// env.test.ts
it("parseEnv carries STORAGE and an invalid storage setting joins the invalid-name list");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/storage-keys.test.ts tests/unit/storage-config.test.ts tests/unit/storage-drivers.test.ts tests/unit/env.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the six files and the `Env` change**

`newSegmentKey`: `u/${userHash(userId)}/tts/${randomBytes(16).toString("hex")}.${ext}`. The memory driver keeps one `Map` per `createMemoryStorage()` call; `getStorage()` for `memory` stores its map on `globalThis` so separate Next bundles share it. The local driver writes to `<dir>/<key>` with `mkdir -p` of the parent, writes `<file>.tmp-<random>` then `rename`. Boot refusal for `local` under `VERCEL` is the config parser's job (spec 3).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/storage-keys.test.ts tests/unit/storage-config.test.ts tests/unit/storage-drivers.test.ts tests/unit/env.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/storage lib/env.ts .gitignore tests/unit/storage-*.test.ts tests/unit/env.test.ts
git commit -m "feat(storage): Storage interface with keys, config, memory and local drivers"
```

**Acceptance:** (1) Every object key starts with the per-user prefix and holds random hex only (spec 5.5). (2) `local` is refused at boot on Vercel (spec 3). (3) `Storage` has exactly `put`, `get`, `delete` and moves whole objects (spec 5.5).

---

### Task 16: S3 and Vercel Blob drivers

**Files:**
- Create: `lib/storage/s3.ts`, `lib/storage/vercel-blob.ts`, `tests/integration/storage-live.test.ts`
- Modify: `lib/storage/index.ts` (the `s3` and `vercel_blob` cases), `package.json` (`@aws-sdk/client-s3`, `@vercel/blob`, versions pinned at install time and recorded in the task report), `docker-compose.yml` (a `minio` service under `profiles: ["storage"]`, port 9000, a local-only root user and password, a named volume), `.env.example` (the `STORAGE_*`, `S3_*` and `BLOB_READ_WRITE_TOKEN` variables with comments)
- Test: `tests/unit/storage-s3.test.ts`, `tests/unit/storage-blob.test.ts`, `tests/integration/storage-live.test.ts`

**Blocked on:** the owner's private Vercel Blob store and its token for the live Blob run, and a running MinIO container for the live S3 run. Both live tests are skipped unless `JOBSMITH_LIVE_STORAGE=1`. The driver code and its unit tests run on injected fake clients with no network.

**Interfaces:**
- Consumes: `Storage`, `StorageConfig` (Task 15).
- Produces: `createS3Storage(config: Extract<StorageConfig, { provider: "s3" }>, client?: S3Like): Storage` and `createVercelBlobStorage(token: string, client?: BlobLike): Storage`, where `S3Like` and `BlobLike` are the minimal structural types the driver calls, so tests inject fakes.

- [ ] **Step 1: Write the failing tests**

```ts
// storage-s3.test.ts (fake client records commands)
it("put sends PutObject with Bucket, Key, Body and ContentType and no ACL");
it("get returns the bytes and returns null for NoSuchKey");
it("get rethrows other errors as StorageError");
it("delete sends DeleteObject and swallows NoSuchKey");
it("builds the client with endpoint, region, forcePathStyle and credentials from the config");
// storage-blob.test.ts (fake client)
it("put always requests private access and never public");
it("put overwrites an existing pathname and adds no random suffix");
it("get returns null when the blob is missing");
it("delete passes the pathname");
// storage-live.test.ts: describe.skipIf(process.env.JOBSMITH_LIVE_STORAGE !== "1")
it("s3 passes the driver contract suite against the configured endpoint");   // reuse the suite from storage-drivers.test.ts, exported from tests/helpers/storage-contract.ts
it("vercel_blob passes the driver contract suite when BLOB_READ_WRITE_TOKEN is set");
```

Move the contract suite from Task 15's test file into `tests/helpers/storage-contract.ts` (`runStorageContract(name, make)`), and call it from both files.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/storage-s3.test.ts tests/unit/storage-blob.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Install the packages and implement both drivers**

Run `pnpm add @aws-sdk/client-s3 @vercel/blob`. Read each package's README in `node_modules` for the private-access option and the get call before writing the Blob driver; the unit test asserts the access value is never `public`. Errors surface as `StorageError` with the SDK error name only, never the key or bytes. Add both cases to `getStorage()`; load the SDKs with dynamic `import()` inside the factory so a deployment that uses `local` never loads them.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/storage-s3.test.ts tests/unit/storage-blob.test.ts tests/unit/storage-drivers.test.ts && pnpm typecheck`
Expected: PASS. Live: `docker compose --profile storage up -d minio`, then `JOBSMITH_LIVE_STORAGE=1 S3_ENDPOINT=http://127.0.0.1:9000 S3_FORCE_PATH_STYLE=true ... pnpm vitest run tests/integration/storage-live.test.ts` and record the result. The Blob live run waits for the owner's token.

- [ ] **Step 5: Commit**

```bash
git add lib/storage package.json pnpm-lock.yaml docker-compose.yml .env.example tests
git commit -m "feat(storage): S3-compatible and Vercel Blob drivers"
```

**Acceptance:** (1) Neither hosted driver ever creates a public object (spec 7). (2) Both pass the same contract suite as `local` and `memory` (spec 8). (3) The SDKs load only when selected.

---

### Task 17: TTS contract, duration gate and spoken text

**Files:**
- Create: `lib/tts/driver.ts`, `lib/tts/gate.ts`, `lib/tts/spoken.ts`
- Test: `tests/unit/tts-gate.test.ts`, `tests/unit/tts-spoken.test.ts`

**Interfaces:**
- Consumes: `Result` from `lib/result.ts`.
- Produces: `TtsStyle`, `TtsErrorCode`, `TtsRequest`, `TtsAudio`, `Voice`, `TtsDriver` (README Contract) and the constants `TTS_STYLE_ID`, `STRICT_INSTRUCTION`; `IDEAL_CPS`, `GATE_*` constants and `passesGate(textChars: number, durationMs: number | null): boolean`; `toSpokenText(markdown: string): string` and `labelSpokenText(label: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// tts-gate.test.ts
it("text of 120 characters or more passes between 5 and 18 characters per second");
//   120 chars: 24_000 ms passes (5.0 cps), 24_100 ms fails; 6_667 ms passes (18.0 cps), 6_600 ms fails
it("shorter text passes between 0.5 and 30 seconds");
//   10 chars: 500 passes, 499 fails, 30_000 passes, 30_001 fails
it("a null duration skips the gate and passes");
it("IDEAL_CPS is 13 and the strict instruction is 'Read every sentence to the end'");
// tts-spoken.test.ts
it("removes bold and italic markers and keeps the words");                   // '**Say** *this*' => 'Say this'
it("keeps a link's text and drops its address");
it("removes the warning marker and emoji");
it("joins bullet and numbered list items as sentences");                      // '- one\n- two' => 'one. two.'; '1. a\n2. b' => 'a. b.'
it("does not double a full stop on an item that already ends in one");
it("removes heading markers and inline code backticks");
it("drops a leftover {{include ...}} token");
it("collapses whitespace and trims");
it("labelSpokenText returns the label with its colon: 'Follow-up (if pressed)' => 'Follow-up (if pressed):'");
it("returns an empty string for markup-only input");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/tts-gate.test.ts tests/unit/tts-spoken.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the three files**

Gate (spec 5.5): `textChars >= GATE_LONG_TEXT_CHARS` compares `textChars / (durationMs / 1000)` to `[GATE_CPS_MIN, GATE_CPS_MAX]`; otherwise `durationMs` to `[GATE_SHORT_MIN_MS, GATE_SHORT_MAX_MS]`. `toSpokenText` is a sequence of regex passes in the order the tests list them. `driver.ts` holds types only plus the two constants and has no imports beyond `Result`, so `lib/audio` and the CLI bundle can import it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/tts-gate.test.ts tests/unit/tts-spoken.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/tts tests/unit/tts-gate.test.ts tests/unit/tts-spoken.test.ts
git commit -m "feat(tts): driver contract, duration gate and spoken text"
```

**Acceptance:** (1) The gate uses the numbers of spec 5.5 and skips on an unreadable duration. (2) `spokenText` removes every item spec 5.5 lists. (3) `lib/tts/driver.ts` imports nothing from the database or Next.

---

### Task 18: Audio: WAV, MP3 encoder, duration, clip preparation

**Files:**
- Create: `lib/audio/wav.ts`, `lib/audio/encode.ts`, `lib/audio/duration.ts`, `lib/audio/normalize.ts`
- Modify: `package.json` (the lamejs-family encoder, pinned at install time; record the package and version in the task report)
- Test: `tests/unit/audio-wav.test.ts`, `tests/unit/audio-encode.test.ts`, `tests/unit/audio-duration.test.ts`, `tests/unit/audio-normalize.test.ts`, `tests/unit/audio-bundle-safe.test.ts`

**Interfaces:**
- Consumes: `TtsAudio` (Task 17), `Result`.
- Produces:

```ts
export function wrapPcmAsWav(pcm: Int16Array, sampleRate: number): Uint8Array;
export function parseWav(bytes: Uint8Array): Result<{ pcm: Int16Array; sampleRate: number }, "tts_bad_output">;   // 16-bit PCM, stereo is averaged to mono
export function encodeMp3(pcm: Int16Array, sampleRate: number): Uint8Array;                                       // mono, 64 kbps
export function mp3DurationMs(bytes: Uint8Array): number | null;      // skips an ID3v2 tag, walks frame headers
export function wavDurationMs(bytes: Uint8Array): number | null;
export function pcmDurationMs(byteLength: number, sampleRate: number): number;   // 16-bit mono
export type PreparedClip = { bytes: Uint8Array; contentType: string; ext: "mp3" | "wav" | "ogg"; durationMs: number | null };
export function prepareClip(audio: TtsAudio): Result<PreparedClip, "tts_bad_output">;
```

- [ ] **Step 1: Write the failing tests**

```ts
// audio-wav.test.ts
it("wrapPcmAsWav writes a 44-byte RIFF header with the sample rate and data length");
it("parseWav reads back the samples and the rate of a wrapped fixture");
it("parseWav averages a stereo file to mono");
it("parseWav rejects a non-PCM or truncated file with tts_bad_output");
// audio-encode.test.ts: a 1-second 440 Hz sine at 24 kHz as the fixture
it("encodeMp3 returns frames that start with a sync word and total 6000 to 10000 bytes for one second");
it("mp3DurationMs of the encoded fixture is within 60 ms of 1000");
// audio-duration.test.ts
it("mp3DurationMs skips an ID3v2 header and returns null when no frame is found");
it("wavDurationMs and pcmDurationMs agree on the fixture: 24000 samples at 24 kHz is 1000 ms");
// audio-normalize.test.ts
it("an audio/mpeg clip is stored as returned, ext mp3, duration from the frames");
it("an audio/wav clip is encoded to mp3 and its duration comes from the PCM length");
it("an audio/L16 clip with a sample rate is encoded to mp3");
it("when encoding throws, a wav clip is stored as wav with ext wav");
it("an audio/ogg clip is stored as returned with ext ogg and a null duration");
it("an empty body or an unknown content type is tts_bad_output");
// audio-bundle-safe.test.ts
it("lib/audio/wav.ts, encode.ts, duration.ts and normalize.ts import nothing from the database, Next or node: modules");   // reads the sources
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/audio-wav.test.ts tests/unit/audio-encode.test.ts tests/unit/audio-duration.test.ts tests/unit/audio-normalize.test.ts tests/unit/audio-bundle-safe.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Install the encoder and implement the four files**

Pick the lamejs-family fork that ships ESM and TypeScript types, is LGPL-3.0 and has no native code (spec 10); wrap it only in `encode.ts`. These four files must stay bundle-safe: the CLI imports them (Task 27), so no `node:` import, no `Buffer`, only `Uint8Array`. MP3 duration walks frame headers (MPEG 1 and 2, Layer III) summing `samplesPerFrame / sampleRate`; a frame length of `floor(144 * bitrate / sampleRate) + padding` for MPEG 1 and `floor(72 * bitrate / sampleRate) + padding` for MPEG 2.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/audio-wav.test.ts tests/unit/audio-encode.test.ts tests/unit/audio-duration.test.ts tests/unit/audio-normalize.test.ts tests/unit/audio-bundle-safe.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/audio package.json pnpm-lock.yaml tests/unit/audio-*.test.ts
git commit -m "feat(audio): WAV wrapping, MP3 encoding, duration and clip preparation"
```

**Acceptance:** (1) PCM and WAV become mono MP3 at 64 kbps; MP3 and Opus are stored as returned; no ffmpeg (spec 3, 5.5). (2) Duration comes from PCM length or frame headers and is null when unreadable (spec 5.5). (3) The four files are bundle-safe (spec 5.5, CLI).

---

### Task 19: TTS config, fake driver and env

**Files:**
- Create: `lib/tts/config.ts`, `lib/tts/fake.ts`, `lib/tts/index.ts`
- Modify: `lib/env.ts` (`Env.TTS: TtsConfig | null`, invalid names join `EnvError`)
- Test: `tests/unit/tts-config.test.ts`, `tests/unit/tts-fake.test.ts`, `tests/unit/env.test.ts` (extend)

**Interfaces:**
- Consumes: `TtsDriver` (Task 17), `mp3DurationMs` (Task 18), `parseEnv`.
- Produces: `TtsConfig`, `TtsIdentity`, `parseTtsConfig`, `ttsIdentity`, `CLI_TTS_IDENTITY`, `DEFAULT_CLI_TTS_URL`, `DEFAULT_TTS_MODELS` (README Contract); `createFakeTtsDriver(options?: { sleep?: (ms: number) => Promise<void> }): TtsDriver`; `silentMp3(durationMs: number): Uint8Array`; `ttsDriverFromConfig(config: TtsConfig, deps?: { fetch?: typeof fetch }): TtsDriver` (only `fake` in this task; Task 20 adds the rest); `getTtsDriver(): TtsDriver | null` (cached, `env().TTS`).

- [ ] **Step 1: Write the failing tests**

```ts
// tts-config.test.ts
it("TTS_PROVIDER unset or blank means off: config null, every other TTS variable ignored");   // a leftover GEMINI_API_KEY alone changes nothing
it("openai_compatible needs TTS_BASE_URL; TTS_API_KEY is optional; the model defaults to 'local'");
it("gemini needs GEMINI_API_KEY and defaults the model to gemini-2.5-flash-preview-tts");
it("elevenlabs needs ELEVENLABS_API_KEY and TTS_MODEL (the spec gives no default)");
it("fake needs nothing and uses model 'fake-tts'");
it("an unknown provider and a malformed TTS_MODEL are invalid, named");
it("ttsIdentity(null) is CLI_TTS_IDENTITY { provider: 'openai_compatible', model: 'local' }; with a config it is { provider, model }");
// tts-fake.test.ts
it("synthesize returns audio/mpeg whose frame duration is within one frame of max(600, round(chars / 13 * 1000)) ms");
it("the output is deterministic for the same text");
it("a 'Fake wait: 200' line delays the answer by 200 ms through the injected sleep and is not counted in the duration");
it("a 'Fake error: tts_rate_limited' line returns that error code");
it("voices lists Vivian, Ryan and Aria");
it("silentMp3 frames are 208 bytes: header FF FB 50 C0 then zeros");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/tts-config.test.ts tests/unit/tts-fake.test.ts tests/unit/env.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement config, the fake and the factory**

As `parseAiConfig` does: off when `TTS_PROVIDER` is blank, so a stray key never sends text anywhere. `silentMp3(ms)`: `ceil(ms / 26.122)` frames of MPEG 1 Layer III, mono, 64 kbps, 44.1 kHz: four header bytes `FF FB 50 C0` followed by 204 zero bytes (208 bytes per frame). `Fake wait: <ms>` is capped at 30 000, like the fit driver's `Fit wait:`; `Fake error: <code>` returns the named `TtsErrorCode`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/tts-config.test.ts tests/unit/tts-fake.test.ts tests/unit/env.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/tts lib/env.ts tests/unit/tts-config.test.ts tests/unit/tts-fake.test.ts tests/unit/env.test.ts
git commit -m "feat(tts): config, fake driver and env wiring"
```

**Acceptance:** (1) TTS is off unless `TTS_PROVIDER` is set (spec 3, 7). (2) The fake driver's clips parse as valid MP3 with a duration that tracks text length, and support `Fake wait:` (spec 5.5). (3) `ttsIdentity` is the one place the TTS-off identity is decided (README owner answer 1).

---

### Task 20: TTS drivers: openai_compatible, gemini, elevenlabs

**Files:**
- Create: `lib/tts/openai-compatible.ts`, `lib/tts/gemini.ts`, `lib/tts/elevenlabs.ts`
- Modify: `lib/tts/index.ts` (`ttsDriverFromConfig` covers all four)
- Test: `tests/unit/tts-openai-compatible.test.ts`, `tests/unit/tts-gemini.test.ts`, `tests/unit/tts-elevenlabs.test.ts`, `tests/unit/tts-drivers-contract.test.ts`

**Blocked on:** the owner's Gemini and ElevenLabs keys for an optional live check, and the owner's Qwen3-TTS server for the `openai_compatible` live check (covered in Task 27 and 31). Every unit test here uses an injected `fetch`.

**Interfaces:**
- Consumes: `TtsConfig`, `TtsRequest`, `TtsAudio`, `Voice`, `STRICT_INSTRUCTION` (Tasks 17 and 19).
- Produces: `createOpenAiCompatibleDriver(config, fetchImpl?)`, `createGeminiDriver(config, fetchImpl?)`, `createElevenLabsDriver(config, fetchImpl?)`, each a `TtsDriver`.

Request shapes (confirm the endpoints against each provider's current documentation at install time and record any difference in the task report):

```text
openai_compatible  POST {TTS_BASE_URL}/audio/speech   JSON { model, input, voice, response_format }  (+ instructions: STRICT_INSTRUCTION on a strict retry)
                   Authorization: Bearer <key> only when TTS_API_KEY is set; asks for the requested format and returns whatever content-type answers (mp3 or wav)
                   voices(): GET {base}/audio/voices then GET {base}/voices; accepts an array of strings, { voices: [...] } of strings, or objects with id or name; [] when neither answers
gemini             POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent   header x-goog-api-key (never in the URL)
                   body { contents:[{parts:[{text}]}], generationConfig:{ responseModalities:["AUDIO"], speechConfig:{ voiceConfig:{ prebuiltVoiceConfig:{ voiceName } } } } }
                   reads candidates[0].content.parts[0].inlineData.data (base64 PCM, 24 kHz) => { audio, contentType: "audio/L16", sampleRate: 24000 }
                   a strict retry prefixes the text with "Read every sentence to the end: "; voices(): a constant list of the prebuilt voice names from Google's current documentation
elevenlabs         POST https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_64   header xi-api-key, body { text, model_id }
                   returns audio/mpeg; no style support; voices(): GET https://api.elevenlabs.io/v1/voices => voice_id and name
```

- [ ] **Step 1: Write the failing tests**

```ts
// each driver file, injected fetch recording url, headers and body
it("sends the documented URL, headers and body fields");
it("never puts the API key in the URL");
it("maps 429 to tts_rate_limited, other non-2xx to tts_error, an aborted request to tts_timeout, an empty body to tts_bad_output");
it("a thrown fetch error becomes tts_error and never throws out of synthesize");
it("trailing slashes on TTS_BASE_URL do not double up");          // openai_compatible
it("a strict retry adds the instruction where the provider accepts a style");   // openai_compatible instructions, gemini prefix, elevenlabs unchanged
it("openai_compatible returns audio/wav content when the server answers wav and audio/mpeg when it answers mp3");
it("gemini decodes the base64 PCM and reports sampleRate 24000");
it("voices parses each provider's answer and returns [] when the call fails");
// tts-drivers-contract.test.ts
it("every driver has a name equal to its provider and a 30 second request timeout");
it("no driver logs the text or the key");                          // spy on console.*
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/tts-openai-compatible.test.ts tests/unit/tts-gemini.test.ts tests/unit/tts-elevenlabs.test.ts tests/unit/tts-drivers-contract.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the three drivers and extend the factory**

Every driver takes `fetchImpl = fetch` and wraps the call in `AbortSignal.timeout(30_000)`; the CLI path allows a longer timeout through a constructor option. They return `Result` and never throw. The Gemini voice list lives in one constant; read Google's TTS documentation for the current names.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/tts-openai-compatible.test.ts tests/unit/tts-gemini.test.ts tests/unit/tts-elevenlabs.test.ts tests/unit/tts-drivers-contract.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/tts tests/unit/tts-*.test.ts
git commit -m "feat(tts): openai_compatible, gemini and elevenlabs drivers"
```

**Acceptance:** (1) The four driver names, their variables and the `Result` error codes match spec 5.5. (2) The text reaches only the configured provider (spec 7). (3) No driver throws or logs the text.

---

### Task 21: Prep settings document

**Files:**
- Create: `lib/prep/settings.ts`
- Test: `tests/unit/prep-settings.test.ts`, `tests/integration/prep-settings.test.ts`

**Interfaces:**
- Consumes: `s.profile.get`, `s.profile.upsert` (the `prep` column from Task 1), `DEFAULT_LOCAL_VOICES`, `Voice`, `normalizeList` is not used.
- Produces: `PrepSettings` and `parsePrepSettings` (README Contract); `DEFAULT_PREP_SETTINGS`; `prepSettingsInputSchema` (strict Zod); `getPrepSettings(s: Scoped): Promise<PrepSettings>`; `savePrepSettings(s: Scoped, input: PrepSettingsInput): Promise<Result<PrepSettings, never>>`; `resolveVoices(settings: PrepSettings, available: Voice[]): { interviewer: string; candidate: string }`; `SPEED_MIN = 0.8`, `SPEED_MAX = 1.5`, `GAP_FACTOR_MIN = 0.5`, `GAP_FACTOR_MAX = 2`.

- [ ] **Step 1: Write the failing tests**

```ts
it("parsePrepSettings of {} or garbage returns the defaults: speed 1, gapFactor 1, null voices");
it("each field falls back on its own: a bad speed does not drop good voices");
it("speed outside 0.8 to 1.5 and gapFactor outside 0.5 to 2 read as their defaults");
it("prepSettingsInputSchema rounds speed to one decimal, rejects out-of-range values with explicit messages, turns a blank voice into null");
it("resolveVoices uses the saved voice ids first");
it("with no saved voices and a provider list holding Vivian and Ryan it picks those two");
it("with a list that lacks them it picks the first two voices, and the same voice twice for a one-voice list");
it("with an empty list it returns DEFAULT_LOCAL_VOICES");
// integration
it("savePrepSettings writes profile.prep and leaves headline, resume and preferences alone");
it("getPrepSettings creates nothing: a user with no profile row gets the defaults");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/prep-settings.test.ts tests/integration/prep-settings.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Follow `lib/preferences/schema.ts`: a stored schema where every field uses `.catch(default)`, a strict input schema for saving. `savePrepSettings` calls `s.profile.upsert({ prep })` with the whole document.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/prep-settings.test.ts tests/integration/prep-settings.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prep/settings.ts tests/unit/prep-settings.test.ts tests/integration/prep-settings.test.ts
git commit -m "feat(prep): versioned prep settings document on the profile"
```

**Acceptance:** (1) The document has version 1, voices, speed 0.8 to 1.5, gap factor 0.5 to 2 and browser voices, read tolerantly (spec 4). (2) Default voices follow spec 5.5. (3) Saving never touches other profile fields.

---

### Task 22: Playback plan and pitch chapters

**Files:**
- Create: `lib/prep/plan.ts`
- Test: `tests/unit/prep-plan.test.ts`

**Interfaces:**
- Consumes: `ParsedBlock`, `toSpokenText`, `labelSpokenText` (Task 17), `GAP_STEP_MS`, `GAP_QUESTION_MS`.
- Produces: the types below, `PlaybackStep` and `PlaybackPlan` (README Contract) and

```ts
export type Speaker = "interviewer" | "candidate";                       // also exported from lib/audio/segments.ts in Task 23 by re-export
export type PlanSource = { question: string; section: string | null; number: number; questionKey: string; blocks: ParsedBlock[] };
export type StepSpec = { questionIndex: number; blockIndex: number | null; kind: "question" | "label" | "text"; speaker: Speaker; text: string };
export type PlayerBlock = { index: number; label: string; spoken: boolean; text: string };
export type PlayerQuestion = { number: number; section: string | null; questionKey: string; question: string; blocks: PlayerBlock[]; level: MarkLevel | null };
export function spokenSteps(sources: PlanSource[]): StepSpec[];
export function buildPlaybackPlan(input: { title: string; subtitle: string; sources: PlanSource[]; levels: Map<string, MarkLevel>; resolveClip: (speaker: Speaker, text: string) => { hash: string; clip: { assetId: string; suspect: boolean } | null } }): PlaybackPlan;
export function pitchChapters(bodyMd: string): PlanSource[];            // each "## " heading starts a chapter spoken in the candidate voice
```

- [ ] **Step 1: Write the failing tests**

```ts
it("a question's steps are: the interviewer reads the question, then per spoken block the interviewer reads the label when there is one and the candidate reads the text");
it("Say has no label step: its text is a candidate step only");
it("note blocks produce no step");
it("a block's text goes through toSpokenText and a block that is empty after cleaning is skipped");
it("gaps: 600 ms after every step inside a question and 1400 ms after a question's last step");
it("a two-question bank with one clip and one browser step: the clip step carries its assetId, the other has clip null, and both carry a hash");
it("step ids are stable: '<questionIndex>-<stepIndex>'");
it("the plan's questions carry blocks with their original index so the transcript can highlight one");
it("pitchChapters turns each ## heading of the nwl-pitch.md fixture into a chapter: 'Short version' and 'Long version'");
it("a chapter's steps are candidate steps only, with the chapter title read by the candidate voice first");
it("text above the first ## heading of a pitch is not spoken");
it("the label step's text is the label with its colon");
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/prep-plan.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/prep/plan.ts`**

Pure, no database. `buildPlaybackPlan` maps `spokenSteps` through `resolveClip` and attaches `gapAfterMs`. The pitch chapter's title is spoken by the candidate voice as its first step (the spec says the pitch is spoken in the candidate voice, as `narrate.py` does); each chapter becomes a `PlanSource` with `question` set to the heading and one spoken block per paragraph group under it (the whole chapter text as one block).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/prep-plan.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prep/plan.ts tests/unit/prep-plan.test.ts
git commit -m "feat(prep): playback plan and pitch chapters"
```

**Acceptance:** (1) Step order and gaps follow spec 5.3 (0.6 and 1.4 seconds). (2) Mixed clip and browser steps coexist in one plan (spec 5.3). (3) A `pitch` is split on `##` into candidate-voice chapters and is never stored as rows (spec 5.1).

---

### Task 23: Segments: hash, planner, generation, delete

**Files:**
- Create: `lib/audio/segments.ts`, `lib/audio/deps.ts`
- Modify: `lib/db/scoped/tts-segment.ts` and `lib/db/scoped/asset.ts` (any method the tests need that Task 2 left out, for example `listWithAssets`)
- Test: `tests/integration/audio-segments.test.ts`, `tests/unit/audio-segment-hash.test.ts`

**Interfaces:**
- Consumes: `spokenSteps` (Task 22), `prepareClip` (Task 18), `passesGate` (Task 17), `TtsDriver`, `Storage`, `newSegmentKey`, the scoped `ttsSegment` and `asset` helpers, `getTtsDriver`, `getStorage`.
- Produces (README Contract names plus):

```ts
export function segmentHash(input: { provider: string; model: string; voice: string; style: string; spokenText: string }): string;
export async function planSegments(s: Scoped, input: { sources: PlanSource[]; identity: TtsIdentity; voices: { interviewer: string; candidate: string }; includeFailed?: boolean }): Promise<SegmentPlan>;
export async function referencedHashes(s: Scoped, identity: TtsIdentity, voices: { interviewer: string; candidate: string }): Promise<Set<string>>;   // every hash any question of any job, or any library item, currently needs
export async function generateMissing(s: Scoped, deps: AudioDeps, input: { needs: SegmentNeed[]; limit: number; identity: TtsIdentity; voices: { interviewer: string; candidate: string } }): Promise<{ generated: number; failed: number; paused: boolean }>;
export async function storeUploaded(s: Scoped, deps: AudioDeps, input: { identity: TtsIdentity; voices: { interviewer: string; candidate: string }; plannedHashes: Set<string>; uploads: { hash: string; contentType: string; durationMs: number | null; bytes: Uint8Array }[] }): Promise<{ stored: number; skipped: number; rejected: { hash: string; reason: "not_planned" | "too_large" | "bad_content_type" }[] }>;
export async function regenerateSegment(s: Scoped, deps: AudioDeps, hash: string, identity: TtsIdentity, voices: { interviewer: string; candidate: string }): Promise<Result<{ suspect: boolean }, "not_found" | "tts_error">>;
export async function deleteUnreferenced(s: Scoped, deps: AudioDeps, referenced: Set<string>): Promise<number>;
export async function deleteAllAudio(s: Scoped, deps: AudioDeps): Promise<number>;
export async function markObjectMissing(s: Scoped, assetId: string): Promise<void>;                 // the segment becomes failed with code object_missing
export async function lookupSegments(s: Scoped, hashes: string[]): Promise<Map<string, { assetId: string; suspect: boolean }>>;   // done segments only
```

`lib/audio/deps.ts`: `audioDeps(): AudioDeps` for production (`getTtsDriver()`, `getStorage()`, `new Date()`, `crypto.randomBytes(...).toString("hex")`).

- [ ] **Step 1: Write the failing tests**

```ts
// audio-segment-hash.test.ts
it("the hash is the first 16 hex of sha256 over 'provider | model | voice | style | spokenText'");   // computed in the test
it("any one field changing changes the hash; the question number and the job never enter it");
// audio-segments.test.ts (PGlite, memory storage, fake TTS driver, fixed clock)
it("planSegments counts distinct (speaker, text) pairs once and reports total, done, failed and suspect");
it("planSegments skips done hashes, and leaves failed ones out of missing unless includeFailed");
it("the same intro at two jobs is one segment");
it("generateMissing stores each clip under u/<hash>/tts/<random>.mp3, inserts an asset row with bytes, sha256, content type and duration, and a done segment row");
it("generateMissing never exceeds the limit and returns the generated count");
it("a clip that fails the gate is retried once with the strict style; a pass on retry leaves suspect false and attempts 2");
it("a second gate failure keeps the clip and sets suspect true");
it("tts_rate_limited ends the batch early with paused true and writes no failed row for it");
it("another tts error writes a failed segment with its error code and the batch goes on");
it("a storage put that throws writes a failed segment with code storage_error and the question stays playable");
it("a batch stops starting new clips after the time budget");           // injected clock past BATCH_BUDGET_MS
it("a second writer racing on one hash deletes its own stored object and leaves one asset");
it("emits one [tts] line per segment with ids, code, provider, model, voice, ms and bytes and never the text");
it("storeUploaded stores only planned hashes: others are rejected with not_planned");
it("storeUploaded skips a hash that is already done and rejects a clip over 2 MB or a content type other than audio/mpeg, audio/wav, audio/ogg");
it("regenerateSegment replaces the asset, deletes the old object and clears failed and suspect");
it("deleteUnreferenced removes segments, asset rows and objects that no current question refers to and keeps the others");
it("deleteAllAudio removes every segment, asset of kind tts_segment and object of the user and no other user's");
it("markObjectMissing sets the segment failed with code object_missing");
it("lookupSegments returns done segments only, with suspect");
it("changing a voice starts a new plan and deletes nothing");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/audio-segment-hash.test.ts tests/integration/audio-segments.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/audio/segments.ts` and `deps.ts`**

`lib/audio/segments.ts` is the only writer of `tts_segment` and their assets: add a test that greps `lib` and `app` for `s.ttsSegment.insert`, `.update(` and `s.asset.insert` outside this file (recordings are the one exception, Task 36). Flow per need: `synthesize({ text, voice, style: "default", format: "mp3" })`, `prepareClip`, `passesGate(text.length, durationMs)`, on failure once more with `style: "strict"`, put to storage, then in one transaction insert the asset and the segment (`ttsSegment.insert` returns null on a duplicate hash: delete the stored object and keep the existing row). `style` column stores `TTS_STYLE_ID`. Log with `console.info("[tts]", {...})`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/audio-segment-hash.test.ts tests/integration/audio-segments.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/audio/segments.ts lib/audio/deps.ts lib/db/scoped tests
git commit -m "feat(audio): content-addressed segments with planner, generation and cleanup"
```

**Acceptance:** (1) The hash follows spec 5.5 and leaves out job and question number. (2) The duration gate retries once with the strict style and then keeps the clip as suspect (spec 5.5). (3) A rate limit ends the batch early; a storage failure fails the segment only (spec 6). (4) `[tts]` lines never hold text (spec 6, 7).

---

### Task 24: Asset route with ranges

**Files:**
- Create: `lib/audio/range.ts`, `lib/audio/serve.ts`, `app/api/assets/[id]/route.ts`
- Test: `tests/unit/audio-range.test.ts`, `tests/integration/audio-serve.test.ts`

**Interfaces:**
- Consumes: `s.asset.getById`, `Storage.get`, `markObjectMissing` (Task 23), `requireUser`, `scopedFor`, `getStorage`.
- Produces:

```ts
export type RangeResult = { kind: "none" } | { kind: "range"; start: number; end: number } | { kind: "unsatisfiable" };
export function parseRange(header: string | null, size: number): RangeResult;     // bytes=a-b, bytes=a-, bytes=-n; anything else is none
export async function serveAsset(s: Scoped, storage: Storage, id: string, rangeHeader: string | null): Promise<Response>;
```

- [ ] **Step 1: Write the failing tests**

```ts
// audio-range.test.ts (size 100)
it("bytes=0-9 is start 0 end 9; bytes=10- runs to the end; bytes=-20 is the last 20 bytes");
it("an end past the size is clamped; a start at or past the size is unsatisfiable");
it("a missing, malformed or multi-range header is none");
// audio-serve.test.ts (PGlite, memory storage, two users)
it("serves the whole object with 200, Content-Type from the asset, Content-Length, Accept-Ranges bytes and 'Cache-Control: private, max-age=31536000, immutable'");
it("answers a Range with 206, the slice and Content-Range 'bytes 0-9/100'");
it("answers an open-ended and a suffix range correctly");
it("answers an unsatisfiable range with 416 and 'Content-Range: bytes */100'");
it("another user's asset id is 404 and a non-uuid id is 404");
it("a missing object returns 404 and marks the segment failed with object_missing");
it("serves the caller's own recording assets the same way");
it("sets a strong ETag from the asset's sha256");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/audio-range.test.ts tests/integration/audio-serve.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the two modules and the route**

The route is `export async function GET(request: Request, ctx: RouteContext<"/api/assets/[id]">)`: `const user = await requireUser()`, `serveAsset(scopedFor(user.id), getStorage(), id, request.headers.get("range"))`. Slice in memory (clips are under 2 MB, spec 5.5). Safari needs the 206 and `Accept-Ranges` to seek.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/audio-range.test.ts tests/integration/audio-serve.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/audio/range.ts lib/audio/serve.ts "app/api/assets/[id]/route.ts" tests/unit/audio-range.test.ts tests/integration/audio-serve.test.ts
git commit -m "feat(audio): authenticated asset route with range support"
```

**Acceptance:** (1) Range requests answer 206 with `Content-Range`, which Safari needs to seek (spec 5.5). (2) A foreign asset id is 404 (spec 5.5, 7). (3) The cache header is exactly `private, max-age=31536000, immutable` (spec 5.5).

---

### Task 25: In-app audio batches and the hub audio panel

**Files:**
- Create: `lib/prep/audio-status.ts`, `app/(app)/jobs/[slug]/audio-actions.ts`, `components/prep/audio-panel.tsx`
- Modify: `lib/prep/hub.ts` (`AudioStatus` widened and computed per bank), `components/prep/bank-card.tsx` (audio line and panel), `docs/design-system.md`
- Test: `tests/unit/prep-audio-status.test.ts`, `tests/integration/audio-actions.test.ts`, `tests/unit/audio-panel.test.tsx`

**Interfaces:**
- Consumes: `planSegments`, `generateMissing`, `deleteUnreferenced`, `referencedHashes`, `regenerateSegment` (Task 23), `resolveVoices`, `getPrepSettings` (Task 21), `ttsIdentity`, `getTtsDriver`, `audioDeps`, `FIT_POLL_MS`, `FIT_POLL_MAX` from `lib/fit/card.ts`, `useAnnounce`.
- Produces:

```ts
export type AudioStatus =
  | { state: "browser" }                          // TTS off and no clips
  | { state: "partial"; done: number; total: number }
  | { state: "ready" };
export function audioStatusText(status: AudioStatus | { state: "preparing" } | { state: "paused" }, done?: number, total?: number): string;
// "Audio ready", "Audio: 61 of 96 clips", "Browser voice", "Preparing audio", "Paused, trying again in a minute"
// audio-actions.ts ("use server", requireUser first)
export async function prepareAudioAction(opportunityId: string, docKey: string | null): Promise<Result<{ done: number; total: number; paused: boolean }, string>>;   // up to SEGMENT_BATCH_LIMIT per call; fail("tts_off", ...) when TTS is unset
export async function regenerateClipAction(opportunityId: string, hash: string): Promise<Result<{ suspect: boolean }, string>>;
export async function deleteAudioAction(): Promise<Result<{ deleted: number }, string>>;        // unreferenced segments across every job
```

- [ ] **Step 1: Write the failing tests**

```ts
// prep-audio-status.test.ts
it("maps each state to the spec's text");                         // 'Audio ready', 'Audio: 61 of 96 clips', 'Browser voice', 'Preparing audio'
it("TTS off with no done clips is browser; TTS off with done clips from the CLI path is partial or ready by the plan");
// audio-actions.test.ts (harness as job-actions.test.ts, fake TTS, memory storage)
it("prepareAudioAction generates up to 20 clips per call and returns done and total");   // 45 needed: three calls give 20, 40, 45
it("prepareAudioAction with TTS off returns tts_off and writes nothing");
it("a rate-limited batch returns paused true");
it("another user's job id is not_found");
it("deleteAudioAction removes only segments no current question of any job needs");
it("regenerateClipAction replaces a suspect clip");
// audio-panel.test.tsx (jsdom, fake timers)
it("shows the audio line, and 'Prepare audio' only when TTS is configured and clips are missing");
it("calls the action again every 3 seconds while clips are missing and shows 'Audio: 61 of 96 clips'");
it("stops at done equal to total and announces 'Audio ready.' once");
it("on paused it shows 'Paused, trying again in a minute' and tries again after 60 seconds");
it("stops after 40 calls");
it("with TTS off it shows the browser voice line and a link to Settings");
it("Delete audio asks for confirmation before calling the action");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/prep-audio-status.test.ts tests/integration/audio-actions.test.ts tests/unit/audio-panel.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement status, actions and the panel**

The hub computes each bank's status from `planSegments` for that bank's questions. The panel loop is a client effect with `setTimeout(FIT_POLL_MS)` between calls, a call counter capped at `FIT_POLL_MAX`, and a 60 second wait after `paused`. The job page already exports `maxDuration = 60`, which sets the limit for its actions; `generateMissing` also stops starting clips after `BATCH_BUDGET_MS`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/prep-audio-status.test.ts tests/integration/audio-actions.test.ts tests/unit/audio-panel.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prep "app/(app)/jobs/[slug]/audio-actions.ts" components/prep docs/design-system.md tests
git commit -m "feat(prep): in-app audio batches with a progress panel on the hub"
```

**Acceptance:** (1) One call generates at most 20 clips and returns `{ done, total }` (spec 5.5). (2) The hub keeps calling at the fit card's rhythm and shows "Audio: 61 of 96 clips" (spec 5.5). (3) A rate limit shows "Paused, trying again in a minute" (spec 6). (4) "Audio ready" is announced (spec 8).

---

### Task 26: Bridge audio endpoints

**Files:**
- Create: `lib/bridge/audio-handlers.ts`, `app/api/bridge/opportunities/[slug]/audio/route.ts` (PUT), `app/api/bridge/opportunities/[slug]/audio/plan/route.ts` (GET)
- Modify: `lib/bridge/handlers.ts` (export `authenticate`, `logBridgeError`, `isValidSlugShape`; `BridgeDeps` gains optional `audio?: { storage: Storage; ttsConfig: TtsConfig | null; randomHex(bytes: number): string }`), `lib/bridge/deps.ts` (`productionDeps` fills `audio`), `lib/bridge/errors.ts` (`too_many_segments`), `lib/bridge/wire.ts` (`WireAudioPlan`, `WireAudioUpload`, `WireAudioResult`, caps `MAX_AUDIO_SEGMENTS = 50`), `tests/helpers/bridge-fetch.ts` (route the two new paths)
- Test: `tests/unit/bridge-audio-schema.test.ts`, `tests/integration/bridge-audio.test.ts`

**Interfaces:**
- Consumes: `planSegments`, `storeUploaded` (Task 23), `resolveVoices`, `getPrepSettings` (Task 21), `ttsIdentity` (Task 19), `readJsonCapped`, `MAX_PUSH_BYTES`, `authenticate`.
- Produces: `handleAudioPlan(deps: BridgeDeps, request: Request, slug: string): Promise<Response>` and `handleAudioUpload(deps, request, slug)`; wire shapes in the README Contract. Both accept `?voice_interviewer=` and `?voice_candidate=`; absent, the voices come from `profile.prep` and then `resolveVoices(settings, [])`.

- [ ] **Step 1: Write the failing tests**

```ts
// bridge-audio-schema.test.ts
it("the upload schema needs hash (16 hex), contentType, a non-negative durationMs and base64");
// bridge-audio.test.ts (PGlite, memory storage, same harness as bridge-handlers.test.ts)
it("GET plan needs a bearer token: 401 without, 401 revoked, 404 for an unknown slug");
it("GET plan lists the missing hashes with speaker and text, the identity and the voices, and counts total and done");
it("GET plan skips done clips");
it("GET plan uses the server's TTS identity when TTS is on and CLI_TTS_IDENTITY when off");
it("voice query parameters override the saved voices");
it("PUT stores a planned clip: an object in storage, an asset row, a done segment");
it("PUT rejects a hash that is not in the current plan with reason not_planned and stores the rest");
it("PUT is idempotent: a second upload of the same clips reports them skipped");
it("PUT with 51 segments is 413 too_many_segments");
it("PUT with a body over 4 MB is 413 payload_too_large");
it("PUT rejects invalid base64 or a clip over 2 MB per segment, without failing the whole request");
it("PUT counts against the same per-token rate limit as push");
it("PUT revalidates the job page when something was stored");
it("another user's job slug is 404 and nothing is stored");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/bridge-audio-schema.test.ts tests/integration/bridge-audio.test.ts`
Expected: FAIL, handlers not found.

- [ ] **Step 3: Implement the handlers, wire types, routes and deps**

Same shape as `handlePushArtifacts`: `authenticate`, slug check, `getBySlug`, `readJsonCapped(request, MAX_PUSH_BYTES)`, a peek at `segments.length` before the full schema, then `storeUploaded` with `plannedHashes` from `planSegments` over the job's questions. Error text from `BRIDGE_ERRORS` (`too_many_segments`: "An audio upload holds at most 50 clips."). Bridge routes are excluded from the proxy matcher already (bearer only); do not add a cookie check.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/bridge-audio-schema.test.ts tests/integration/bridge-audio.test.ts tests/integration/bridge-handlers.test.ts tests/unit/bridge-errors.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bridge "app/api/bridge" tests
git commit -m "feat(bridge): audio plan and upload endpoints for the CLI"
```

**Acceptance:** (1) The server verifies every hash is in the current plan before storing (spec 5.5). (2) The same bearer, rate limit row and body caps as push: 4 MB and 50 segments (spec 7). (3) A hosted Jobsmith can use a voice that exists only on the user's laptop (spec 5.5).

---

### Task 27: CLI `jobsmith audio`

**Files:**
- Create: `cli/src/commands/audio.ts`
- Modify: `cli/src/args.ts` (`Command` gains `{ name: "audio"; slug: string; ttsUrl: string | null; voiceInterviewer: string | null; voiceCandidate: string | null }`; options `--tts-url`, `--voice-interviewer`, `--voice-candidate`; USAGE line `audio <slug> [--tts-url <base>] [--voice-interviewer <v>] [--voice-candidate <v>]`), `cli/src/main.ts` (case `audio`), `tests/integration/cli-bundle.test.ts` (allow exactly the MP3 encoder package among the inputs from `node_modules`, and no other)
- Test: `tests/unit/cli-args.test.ts` (extend), `tests/integration/cli-audio.test.ts`

**Blocked on:** the owner's local Qwen3-TTS server at `http://127.0.0.1:8890/v1` for the last step (the live run). Everything else runs against a fake OpenAI-compatible server on `127.0.0.1` started inside the test.

**Interfaces:**
- Consumes: `bridgeRequest`, `extractServerMessage`, `parseJson` from `cli/src/http.ts`, `prepareClip` (Task 18), `DEFAULT_CLI_TTS_URL`, the plan and upload wire shapes (Task 26), `CliIo`.
- Produces: `runAudio(io: CliIo, creds: { url: string; token: string }, command: Extract<Command, { name: "audio" }>): Promise<number>`. Flow: GET the plan (voices as query when given), POST each segment to `<tts-url>/audio/speech` with `{ model: plan.identity.model, input, voice, response_format: "mp3" }`, run `prepareClip` (encodes a `wav` answer), batch up to 50 clips and 4 MB of request JSON, PUT with the plan's voices as query. Prints `Synthesized 12 of 96 clips.` lines and `Uploaded N clips, M already there.`; exits 1 when the speech server cannot be reached (`Could not reach <url>: ...`), 1 on a refused token (same sentence as `pull`), 0 otherwise even if some clips were rejected, with a count.

- [ ] **Step 1: Write the failing tests**

```ts
// cli-args.test.ts
it("parses 'audio acme --tts-url http://127.0.0.1:9 --voice-interviewer A --voice-candidate B'");
it("audio needs a slug and rejects a slug shaped like a path");
it("the usage text lists audio");
// cli-audio.test.ts (PGlite + bridgeFetch for the bridge, a node:http server on 127.0.0.1 for speech; io.fetch routes by URL)
it("fetches the plan, synthesizes each segment against the speech server and uploads them; the app then holds done segments for every planned hash");
it("a wav answer from the speech server is encoded to mp3 before upload");
it("the speech request carries the plan's model and the voices and no authorization header unless the URL needs one");
it("uploads in batches of at most 50 clips and 4 MB");
it("a second run uploads nothing: 'Uploaded 0 clips, N already there.'");
it("an unreachable speech server exits 1 with 'Could not reach <url>' and uploads nothing");
it("a refused token exits 1 with the same message as pull");
it("sends the spoken text only to the speech server it was pointed at and to the Jobsmith URL, never anywhere else");   // io.fetch records every host
// cli-bundle.test.ts
it("the bundle's node_modules inputs are exactly the encoder package");
it("the bundle still runs under plain Node: --version prints the version");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/cli-args.test.ts tests/integration/cli-audio.test.ts tests/integration/cli-bundle.test.ts`
Expected: FAIL, `audio` is not a command and the bundle test rejects the encoder.

- [ ] **Step 3: Implement the command, the args and the bundle test change**

Update `README.md`'s CLI list in Task 31. The default speech URL is `DEFAULT_CLI_TTS_URL`. Use `io.fetch` for the speech calls too, with a 120 second timeout per clip, so tests stub both hosts.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/cli-args.test.ts tests/integration/cli-audio.test.ts tests/integration/cli-bundle.test.ts && pnpm cli:build && pnpm typecheck`
Expected: PASS. Live run on the owner's machine: start the Qwen3-TTS server, `jobsmith audio <slug>`, then open Listen and confirm the clips play; record the result in the task report.

- [ ] **Step 5: Commit**

```bash
git add cli tests
git commit -m "feat(cli): jobsmith audio synthesizes clips against a local OpenAI-compatible server"
```

**Acceptance:** (1) `jobsmith audio <slug>` follows spec 5.5: plan, synthesize, encode a `wav` answer, upload batches of up to 4 MB. (2) The bundle stays one file with no install-time dependency; the encoder is the only bundled package (spec 5.5). (3) Text goes only to the endpoint the user names, default their own machine (spec 7).

---

### Task 28: Playback engine and Media Session

**Files:**
- Create: `lib/prep/engine-state.ts`, `components/player/speaker.ts`, `components/player/engine.ts`, `components/player/media-session.ts`
- Test: `tests/unit/prep-engine-state.test.ts`, `tests/unit/player-speaker.test.tsx`, `tests/unit/player-engine.test.tsx`, `tests/unit/media-session.test.tsx`

**Interfaces:**
- Consumes: `PlaybackPlan`, `PlaybackStep` (Task 22), `SPEED_MIN`, `SPEED_MAX`, `IDEAL_CPS`.
- Produces:

```ts
// lib/prep/engine-state.ts (pure)
export type EngineStatus = "idle" | "playing" | "gap" | "paused" | "ended";
export type EngineState = { stepIndex: number; status: EngineStatus; speed: number };
export type EngineEvent =
  | { type: "play" } | { type: "pause" } | { type: "step_ended" } | { type: "gap_elapsed" }
  | { type: "next_question" } | { type: "prev_question" } | { type: "repeat_question" }
  | { type: "seek_step"; stepIndex: number } | { type: "set_speed"; speed: number };
export function engineReducer(state: EngineState, event: EngineEvent, plan: PlaybackPlan): EngineState;
export function stepIndexForQuestion(plan: PlaybackPlan, questionIndex: number): number;
// components/player/speaker.ts
export type SpeakOutcome = "ended" | "clip_failed" | "cancelled";
export function useSpeaker(options: { browserVoices: { interviewer: string | null; candidate: string | null } }): { speak(step: PlaybackStep, speed: number): Promise<SpeakOutcome>; cancel(): void };
// components/player/engine.ts
export function usePlaybackEngine(plan: PlaybackPlan, options: { speed: number; browserVoices: { interviewer: string | null; candidate: string | null }; onClipFailed?(step: PlaybackStep): void }): { state: EngineState; currentStep: PlaybackStep | null; currentQuestionIndex: number; dispatch(event: EngineEvent): void };
// components/player/media-session.ts
export function useMediaSession(input: { title: string; artist: string; artworkUrl: string; onPlay(): void; onPause(): void; onPrevious(): void; onNext(): void; active: boolean }): { backgroundStopped: boolean };
```

- [ ] **Step 1: Write the failing tests**

```ts
// prep-engine-state.test.ts: a table over a plan of two questions (3 steps and 2 steps)
it("play from idle starts step 0");
it("step_ended on a step with a gap moves to gap; gap_elapsed moves to the next step");
it("the last step ending sets ended");
it("next_question jumps to the first step of the next question and keeps playing; on the last question it ends");
it("prev_question jumps to the first step of the previous question; on the first question it restarts it");
it("repeat_question restarts the current question's first step");
it("seek_step sets the step and keeps the status unless ended, which becomes playing");
it("pause keeps the step index from playing or gap; play from paused replays the current step from its start");
it("set_speed clamps to 0.8 to 1.5 and rounds to one decimal");
// player-speaker.test.tsx (jsdom; stub Audio and speechSynthesis)
it("a step with a clip plays /api/assets/<assetId> with playbackRate set to the speed and resolves ended when it ends");
it("a clip error falls back to the browser voice for that step and resolves clip_failed");
it("a step without a clip speaks through speechSynthesis with rate equal to the speed and the voice chosen for the speaker");
it("with no speechSynthesis the step resolves after text length / 13 / speed seconds so text-only mode still advances");
it("cancel stops audio and speech and resolves cancelled");
// player-engine.test.tsx
it("plays a two-question plan end to end through the speaker and the gaps: 600 ms inside a question, 1400 ms between");
it("pause stops the speaker and play resumes the step");
it("marking never calls pause: the engine has no mark event");
it("onClipFailed is called once per failed step");
// media-session.test.tsx (stub navigator.mediaSession)
it("sets metadata title, artist and the artwork, and the play, pause, previoustrack and nexttrack handlers");
it("reports backgroundStopped once when the page is hidden while playing and the audio pauses by itself");
it("does nothing when navigator.mediaSession is missing");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/prep-engine-state.test.ts tests/unit/player-speaker.test.tsx tests/unit/player-engine.test.tsx tests/unit/media-session.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the reducer, the speaker, the engine and the Media Session hook**

The reducer is the whole state machine; the hook only turns state into side effects (`speak` on entering `playing`, a timer on `gap`). Gaps are wall-clock time and do not scale with speed. One `HTMLAudioElement` is reused per speaker. The Media Session hook sets artwork from `/brand/mark.svg` (`image/svg+xml`, `sizes: "any"`), and "the player says so once" is the hook's `backgroundStopped` flag; Task 29 renders the sentence.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/prep-engine-state.test.ts tests/unit/player-speaker.test.tsx tests/unit/player-engine.test.tsx tests/unit/media-session.test.tsx && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prep/engine-state.ts components/player tests/unit
git commit -m "feat(player): one playback engine, speaker and Media Session hook"
```

**Acceptance:** (1) One engine drives Listen, Drill and Quick-fire from `PlaybackStep`s (spec 3, "Playback"). (2) A failed or missing clip speaks through the browser voice, and text-only mode still advances (spec 5.3, principle 9). (3) Speed 0.8 to 1.5 in 0.1 steps through `playbackRate` and `rate` (spec 5.3).

---

### Task 29: Listen screen

**Files:**
- Create: `lib/prep/player-data.ts`, `app/(app)/jobs/[slug]/listen/page.tsx`, `components/player/listen-player.tsx`, `components/player/transcript.tsx`, `components/player/player-controls.tsx`
- Modify: `lib/prep/hub.ts` (a `pitches` list of `{ key, title }` and the Listen link per bank), `components/prep/bank-card.tsx` (Listen button), `components/prep/question-list.tsx` (a tap target on each question opens `listen?doc=<ref>&q=<N>`), `components/prep/prep-hub.tsx` (pitch cards with Listen only), `docs/design-system.md`
- Test: `tests/integration/prep-player-data.test.ts`, `tests/unit/transcript.test.tsx`, `tests/unit/listen-player.test.tsx`

**Interfaces:**
- Consumes: `buildPlaybackPlan`, `pitchChapters`, `spokenSteps` (Task 22), `segmentHash`, `lookupSegments`, `planSegments` (Task 23), `getPrepSettings`, `resolveVoices` (Task 21), `ttsIdentity`, `usePlaybackEngine`, `useMediaSession` (Task 28), `MarkButtons`, `markQuestionAction`, `regenerateClipAction` (Task 25), `parseDocRef`.
- Produces:

```ts
export async function loadPlayerData(s: Scoped, input: { opportunityId: string; docKey: string; scope: "opportunity" }): Promise<Result<{ plan: PlaybackPlan; settings: PrepSettings; subtitle: string; kind: "bank" | "pitch" }, "not_found">>;
// the route: /jobs/[slug]/listen?doc=<ref>&q=<N>   (q optional, starts at that question number or chapter)
```

Listen behaviour (spec 5.3): sticky header "Question 7 of 32" plus the section name; controls play and pause, previous, next, repeat, speed select 0.8 to 1.5 in 0.1 steps; the three mark buttons always visible, marking the current question through `markQuestionAction` with `drilled: false` and never pausing; the transcript shows the current question's blocks with the playing block carrying `aria-current="true"`, a tap seeking to its first step, note blocks dimmed, a "browser voice" label on steps with no clip and a "check this clip" note with a "Regenerate" button on suspect clips; the one-time background notice in proposed copy "Playback stopped when the screen turned off. Your phone does not let audio continue." when `backgroundStopped`. A `pitch` shows chapters instead of questions and no mark buttons.

- [ ] **Step 1: Write the failing tests**

```ts
// prep-player-data.test.ts (PGlite, fake TTS identity)
it("builds a plan for a bank: steps in source order with the saved clips attached and browser steps for the rest");
it("a pending or failed segment, or no segment, gives clip null for that step");
it("a suspect clip carries suspect true");
it("a pitch artifact gives chapters as the questions and candidate-only steps");
it("an unknown document key is not_found and another user's job is not_found");
it("with TTS off it still attaches done clips whose hash matches CLI_TTS_IDENTITY");
it("the plan holds each question's current mark level from the job's marks");
// transcript.test.tsx
it("highlights the playing block with aria-current and nothing else");
it("tapping a block seeks to its first step");
it("note blocks show dimmed and are never given a step");
it("shows 'browser voice' on a step without a clip and 'check this clip' with a Regenerate button on a suspect one");
// listen-player.test.tsx (engine stubbed)
it("shows 'Question 7 of 32' and the section name");
it("speed select offers 0.8 to 1.5 in steps of 0.1");
it("mark buttons stay visible, call the action and never dispatch pause");
it("previous, next, repeat and play and pause dispatch the matching engine events");
it("shows the background notice once");
it("a pitch shows chapters and no mark buttons");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/prep-player-data.test.ts tests/unit/transcript.test.tsx tests/unit/listen-player.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the loader, the page and the components**

`loadPlayerData` reads the document's rows (or the pitch body through `pitchChapters`), computes the segment hashes for the current identity and voices, looks up done segments in one query and builds the plan with `resolveClip`. The page is a server component with `requireUser()`; it renders `<ListenPlayer>` in a centered column on desktop and full height on phone. Run the unslop render tier at 375 and 1280 pixels, light and dark.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/prep-player-data.test.ts tests/unit/transcript.test.tsx tests/unit/listen-player.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prep "app/(app)/jobs/[slug]/listen" components docs/design-system.md tests
git commit -m "feat(prep): Listen screen with transcript, speed, marks and pitch chapters"
```

**Acceptance:** (1) Every control and label of spec 5.3 is present. (2) A mixed bank plays through, with browser-spoken steps labelled (spec 5.3). (3) A pitch opens in the same player with chapters (spec 5.3). (4) Marking never stops playback (spec 5.3).

---

### Task 30: Settings Voice section and storage line

**Files:**
- Create: `components/settings/voice-section.tsx`, `lib/prep/voices.ts`
- Modify: `app/(app)/settings/page.tsx`, `app/(app)/settings/actions.ts` (`savePrepSettingsAction`, `deleteAllAudioAction`), `docs/design-system.md`
- Test: `tests/integration/settings-voice.test.ts`, `tests/unit/voice-section.test.tsx`

**Interfaces:**
- Consumes: `getPrepSettings`, `savePrepSettings`, `prepSettingsInputSchema`, `resolveVoices` (Task 21), `getTtsDriver` (Task 19), `deleteAllAudio` (Task 23), `s.asset.totals`, `SettingsSection` (`components/settings/settings-section.tsx`), `submitViaTransition`.
- Produces: `loadVoiceOptions(driver: TtsDriver | null, timeoutMs?: number): Promise<Voice[]>` (races `driver.voices()` against 3000 ms and returns `[]` on timeout or error); the Voice section: provider status line (the provider name, or "Off: the player uses your browser's voices"), Interviewer and Me pickers from the provider's list (a text field for a voice id when the list is empty), browser voice pickers filled from `speechSynthesis.getVoices()` on the device (with the `voiceschanged` event), speed and gap factor with their defaults shown, a Storage line "{n} clips, {size}" (proposed copy) and "Delete all audio" with confirmation.

- [ ] **Step 1: Write the failing tests**

```ts
// settings-voice.test.ts (actions harness as job-actions.test.ts)
it("savePrepSettingsAction saves voices, speed, gap factor and browser voices and returns field errors for an out-of-range speed");
it("deleteAllAudioAction removes every segment, asset and object of the caller");
it("loadVoiceOptions returns [] when the driver times out or throws");
// voice-section.test.tsx
it("with TTS off it shows 'Off: the player uses your browser's voices' and no provider pickers");
it("with TTS on it lists the provider's voices and pre-selects the saved ones, else Vivian and Ryan");
it("with an empty provider list it shows a text field for each voice");
it("browser voice pickers fill from speechSynthesis.getVoices and refill on voiceschanged");
it("shows the defaults for speed (1) and gap factor (1)");
it("Delete all audio asks for confirmation");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/settings-voice.test.ts tests/unit/voice-section.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the section, the helper and the actions**

The Settings page stays a server component; it loads `prep`, the voice options and the asset totals and passes plain data to the client section. A voice change never deletes old clips (spec 5.5), and the section says so in one line of proposed copy: "Changing a voice keeps your existing clips. Delete audio on a job's Prep tab removes the ones no question uses.".

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/settings-voice.test.ts tests/unit/voice-section.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/settings lib/prep/voices.ts "app/(app)/settings" docs/design-system.md tests
git commit -m "feat(settings): Voice section, browser voices and storage line"
```

**Acceptance:** (1) The Voice section has every control of spec 5.10. (2) With no TTS the section says so and the player uses browser voices (spec 5.10). (3) "Delete all audio" removes clips and objects (spec 5.10).

---

### Task 31: End to end, docs and ship

**Files:**
- Create: `tests/e2e/prep-voice.spec.ts`, `tests/e2e/fake-speech-server.ts` (a `node:http` server on `127.0.0.1` returning `silentMp3`), `tests/e2e/stub-speech.ts` (an init script that stubs `speechSynthesis`)
- Modify: `playwright.config.ts` (the webServer command gains `TTS_PROVIDER=fake STORAGE_PROVIDER=local STORAGE_LOCAL_DIR=.data/e2e-storage`), `tests/e2e/global-setup.ts` (removes `.data/e2e-storage`), `.env.example`, `README.md` (a Voice section: TTS and storage variables, `jobsmith audio`, the Qwen3-TTS default URL), `docs/design-system.md`
- Test: `tests/e2e/prep-voice.spec.ts`

**Blocked on:** the owner's Qwen3-TTS server for the live CLI check, and the owner's private Vercel Blob store plus token for the preview check with `STORAGE_PROVIDER=vercel_blob`. The CI run uses `fake` TTS and `local` storage.

**Interfaces:**
- Consumes: the helpers from Task 14, `createToken` from `tests/e2e/token.ts`, `runCli`.
- Produces: the Milestone 7 end to end proof for Chromium, WebKit and the phone project.

- [ ] **Step 1: Write the failing e2e spec**

```ts
test("Prepare audio climbs from none to ready on the hub", ...);          // 'Audio: 0 of N clips' climbs, then 'Audio ready'
test("Listen plays two questions in two voices and highlights the playing block", ...);   // aria-current moves, question header advances, speed 1.5 shortens the wait
test("a mark taps through while playing and playback continues", ...);
test("a failed clip speaks through the browser voice and is labelled", ...);               // page.route aborts /api/assets/*, stub speechSynthesis, expect the 'browser voice' label
test("the asset route answers a Range request with 206 and a foreign id with 404", ...);   // APIRequestContext, both engines
test("a pitch opens in Listen as chapters", ...);                                          // packet nwl-pitch.md
test("changing a voice in Settings starts a new plan and keeps the old clips", ...);       // fake provider lists Vivian, Ryan, Aria
test("jobsmith audio uploads clips from a speech server on 127.0.0.1 and the hub shows Audio ready", ...);
test("Listen and the Settings Voice section pass axe in light and dark", ...);             // phone project too
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e --project=prep-chromium`
Expected: FAIL until the config carries the new environment, then PASS.

- [ ] **Step 3: Wire the environment and write the docs**

WebKit may not decode MP3 on every CI image; the engine's clip-failure fallback keeps the Listen test meaningful, and the test asserts the transcript advances either way. Record any engine-specific skip with its reason in the spec file.

- [ ] **Step 4: Run the full suite and the preview checks**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit and the phone project. Then the owner-dependent checks: (1) on the owner's machine with Qwen3-TTS running, `jobsmith audio <slug>` against the preview, then Listen on desktop and phone plays in two voices; (2) the preview with `STORAGE_PROVIDER=vercel_blob` and a private store stores and plays a clip. Report the preview URL and both results.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e playwright.config.ts .env.example README.md docs/design-system.md
git commit -m "test(prep): Milestone 7 end to end, docs and ship"
```

**Acceptance:** (1) The done-when sentence passes in CI on fake TTS for desktop and phone (spec 9). (2) The CLI path is proven in CI against a fake speech server and once live on the owner's machine (spec 9). (3) Axe has zero violations on Listen and Settings in light and dark (spec 8). (4) No clip is public and no foreign asset id is readable (spec 7).
