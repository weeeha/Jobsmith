# Milestone 28: Recordings

> Done when: "A synthetic recording uploads on desktop and phone and transcribes through the fake driver in CI and, through the CLI, the owner's local whisper server; the stored object is gone once the transcript saves; a 30 MB file is refused before upload; an abandoned upload is gone after a day"

Branch: `feat/m28-recordings`, cut from `main` once Milestone 25, Prep milestone 7 and Hosted milestones 11, 13 and 14 are merged. Milestone 27 is not required; the transcript lands as a `generated` version and Milestone 25's ingest reads it.

**Before starting:**

```bash
test -f lib/debrief/ingest.ts && test -f lib/debrief/save.ts && echo m25-ok          # absent: stop
test -f lib/storage/driver.ts && test -f lib/audio/duration.ts && echo prep-7-ok    # absent: stop (no storage, no asset table)
grep -rn "asset" lib/db/schema/*.ts | head -3                                        # the asset table must exist
test -f lib/generate/start.ts && test -f lib/debrief/hosted-port.ts && echo hosted-and-port-ok   # absent: the port's no-generation fallback applies
test -f lib/jobs/steps.ts && echo tick-ok                                            # absent: the expiry step runs lazily only
test -f lib/quota/storage.ts && echo quota-ok                                        # absent: no storage quota check in Task 39
pnpm install && pnpm typecheck && pnpm test
```

In the first task report, record the exact Prep names Task 35 and Task 37 extend: the `Storage` interface, the four drivers, the `asset` scoped helper, the duration reader's dispatch function, and the key builder that applies the `u/<user_hash>/` prefix.

### Task 35: Migration, sniffing, M4A duration

**Files:**
- Create: `lib/audio/sniff.ts`, `lib/db/migrations/<next>_recordings.sql` (generated)
- Modify: `lib/audio/duration.ts` (from 2026-11-21-jobsmith-prep milestone 7: `m4aDurationMs`, wired into its dispatch), `lib/db/schema/debrief.ts` (`audioAssetId`, `audioMs`, `recordingAttestedAt`, `keepAudio`), the `asset` schema file (`expiresAt`; `asset_kind_check` gains `interview_audio`), `lib/generate/values.ts` (from 2026-11-21-jobsmith-hosted milestone 13) and the `generation.task` check (gain `transcribe_audio`), `lib/credits/costs.ts` (from 2026-11-21-jobsmith-hosted milestone 14: `METERED_TASKS`, `TASK_COSTS` per 2 started minutes through `costOf`, `TASK_DAILY_CAPS.transcribe_audio = 240` minutes)
- Test: `tests/unit/audio-sniff.test.ts`, `tests/unit/audio-duration-m4a.test.ts`, `tests/unit/credits-costs.test.ts` (new cases), `tests/integration/debrief-schema.test.ts` (new cases)

**Interfaces:**
- Consumes: Prep's `asset` table and duration reader; Hosted's `costOf`
- Produces: `sniffAudio(head: Uint8Array): AudioSniff`; `m4aDurationMs(bytes: Uint8Array): number | null`; `costOf("transcribe_audio", startedMinutes)` equal to `Math.ceil(startedMinutes / 2)`; columns `asset.expires_at` (timestamptz null), `debrief.audio_asset_id` (FK to `asset.id`, set null), `debrief.audio_ms` (integer null), `debrief.recording_attested_at` (timestamptz null), `debrief.keep_audio` (boolean not null default false)

Sniff rules: ID3 (`49 44 33`) or an MPEG frame sync (first byte `0xFF`, second byte with its top three bits set) is `mp3`; bytes 4 to 8 `ftyp` with brand `M4A `, `M4B `, `M4P ` or `F4A ` is `m4a`, with brand `isom`, `iso2`, `mp41`, `mp42`, `avc1`, `M4V `, `qt  `, `3gp4`, `3gp5` or `3g2a` is `{ ok: false, reason: "video" }`; `RIFF` then four bytes then `WAVE` is `wav`; `1A 45 DF A3` is `webm`; `OggS` is `ogg`; `fLaC` is `flac`; anything else is `{ ok: false, reason: "unknown" }`.

- [ ] **Step 1: Write the failing tests**

```ts
it.each([...])("sniffAudio %s", ...);   // one case per rule above, plus a 3-byte buffer reading unknown
it("m4aDurationMs reads mvhd version 0 (timescale 1000, duration 5000 gives 5000 ms) and version 1 with a 64-bit duration", ...);   // boxes built in the test
it("m4aDurationMs finds moov after a large mdat and returns null for a truncated file", ...);
it("costOf transcribe_audio is 1 credit per 2 started minutes: 1 gives 1, 2 gives 1, 3 gives 2, 50 gives 25", ...);
it("asset.kind accepts interview_audio and every earlier value; generation.task accepts transcribe_audio and every earlier value", ...);
it("deleting an asset sets debrief.audio_asset_id to null", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/audio-sniff.test.ts tests/unit/audio-duration-m4a.test.ts tests/unit/credits-costs.test.ts tests/integration/debrief-schema.test.ts`
Expected: FAIL, modules and columns do not exist.

- [ ] **Step 3: Implement**

Rewrite each check to list every current value plus the new one, reading the current lists from the schema at implementation time and dropping none (the task report lists the final sets). The `mvhd` reader walks top-level boxes (size, type; size 1 means a 64-bit size follows) to `moov`, then inside it to `mvhd`; version 0 holds timescale and duration as 32-bit values at offsets 12 and 16 of the box payload, version 1 holds a 32-bit timescale at 20 and a 64-bit duration at 24.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/debrief-schema.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(debrief): audio sniffing, M4A duration and the recordings migration"
```

**Acceptance:** (1) every magic-byte rule of spec 5.3 is a test, and a video brand reads as video; (2) `transcribe_audio` is priced 1 credit per 2 started minutes with a 240-minute daily cap (spec 5.5); (3) no check constraint lost an earlier value (spec 4).

### Task 36: `lib/transcribe`

**Files:**
- Create: `lib/transcribe/driver.ts`, `lib/transcribe/config.ts`, `lib/transcribe/openai-compatible.ts`, `lib/transcribe/fake.ts`, `lib/transcribe/segments.ts`, `lib/transcribe/index.ts`, `lib/transcribe/gateway.ts` (only if the gateway has a route, see Step 3)
- Modify: `lib/env.ts` (`Env.TRANSCRIBE: TranscribeConfig | null`, parsed inside `parseEnv`, bad values join `EnvError`'s list), `.env.example`
- Test: `tests/unit/transcribe-config.test.ts`, `tests/unit/transcribe-openai.test.ts`, `tests/unit/transcribe-segments.test.ts`, `tests/unit/transcribe-fake.test.ts`, `tests/unit/env.test.ts` (new cases)

**Interfaces:**
- Consumes: `Result`
- Produces: `TranscribeDriver`, `TranscribeError`, `TranscribeSegment` (Contract; `transcribe` input also takes `fileName?: string`, read only by the fake driver), `TranscribeConfig`, `parseTranscribeConfig`, `driverFromConfig(config, deps?)`, `getTranscribeDriver()` (memoized, null when off), `segmentsToText(segments, fallbackText)`, `providerLabel(config)`

```ts
export type TranscribeConfig =
  | { provider: "openai_compatible"; baseUrl: string; apiKey: string | null; model: string; maxBytes: number; timeoutMs: number }
  | { provider: "gateway"; model: string; maxBytes: number; timeoutMs: number }
  | { provider: "fake"; model: "fake-stt"; maxBytes: number; timeoutMs: number; waitMs: number };
```

- [ ] **Step 1: Write the failing tests**

```ts
// config
it("unset or blank TRANSCRIBE_PROVIDER means off and ignores every other variable", ...);
it("openai_compatible needs a valid http or https TRANSCRIBE_BASE_URL; the model defaults to whisper-1; the key is optional", ...);
it("TRANSCRIBE_MAX_MB defaults to 25, accepts 1 to 200 and rejects 0, 201 and 'abc'; TRANSCRIBE_TIMEOUT_S defaults to 240", ...);
it("an unknown provider returns invalid ['TRANSCRIBE_PROVIDER']", ...);
it("fake reads TRANSCRIBE_FAKE_WAIT_MS (default 0)", ...);
// openai-compatible (a local http server on 127.0.0.1 or an injected fetch)
it("POSTs multipart to {base}/audio/transcriptions with file, model, response_format=verbose_json and a prompt holding company, role and people names", ...);
it("retries once with response_format=json when the first answer is 400", ...);
it("maps 413 to stt_too_large, a second 400 to stt_bad_audio, 429 to stt_rate_limited, a timeout to stt_timeout and anything else to stt_error", ...);
it("reads verbose_json segments in seconds into startMs and endMs and the duration into durationMs; json without segments gives segments null", ...);
it("sends Authorization only when a key is configured; the base URL comes only from config, never from the call", ...);
// segments
it("joins segments with a space and puts a paragraph break where the pause exceeds 2 seconds, with no timestamps", ...);
// fake
it("returns the tests/fixtures/debrief fixture named by fileName's base name, else the fixed transcript; waits TRANSCRIBE_FAKE_WAIT_MS", ...);
it("providerLabel is the base URL's host, 'the AI Gateway' or 'the test transcriber'", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/transcribe-config.test.ts tests/unit/transcribe-openai.test.ts tests/unit/transcribe-segments.test.ts tests/unit/transcribe-fake.test.ts tests/unit/env.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Follow `lib/ai/config.ts` and `lib/ai/index.ts` for the shape. `maxBytes` is `TRANSCRIBE_MAX_MB * 1024 * 1024`. The fake driver returns `durationMs = max(1000, round(audio.length / 4))` (32 kbps), segments null, and one fixed fictional transcript of interviewer and candidate lines about Northwind Traders. Gateway decision: read the current AI Gateway and AI SDK transcription docs (network, at implementation time) and write the finding in the task report. If a transcription route exists, build `gateway.ts` with zero data retention (as `GATEWAY_PROVIDER_OPTIONS` does for text) and test it with the SDK's mock model. If none exists, do not build it: `parseTranscribeConfig` returns `invalid: ["TRANSCRIBE_PROVIDER"]` for `gateway`, a test pins that, and the README says the hosted deployment runs `openai_compatible` against a provider named on the privacy page (the owner's choice, listed in the README's open items). `.env.example` gets all seven variables with comments, commented out.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib .env.example tests
git commit -m "feat(transcribe): driver interface, config, openai-compatible and fake drivers"
```

**Acceptance:** (1) off when unset, like `AI_PROVIDER` (spec 3, 5.3); (2) the request and error mapping match spec 5.3; (3) the fake driver pends for `TRANSCRIBE_FAKE_WAIT_MS` so states can be scanned (spec 5.3); (4) the gateway finding is recorded (spec 5.3).

### Task 37: Upload target, token, route, proxy exclusion

**Files:**
- Create: `lib/storage/upload-token.ts`, `app/api/debrief/upload/[token]/route.ts`
- Modify: `lib/storage/driver.ts` (from 2026-11-21-jobsmith-prep milestone 7: `UploadTarget`, `createUpload`, `head`, `putStream`), `lib/storage/local.ts` and `lib/storage/memory.ts` (from 2026-11-21-jobsmith-prep milestone 7), `proxy.ts` (matcher gains `api/debrief/upload/`), `tests/unit/proxy-matcher.test.ts`
- Test: `tests/unit/upload-token.test.ts`, `tests/integration/upload-route.test.ts`, `tests/integration/storage-upload-local.test.ts`

**Interfaces:**
- Consumes: Prep's `Storage` and the two drivers
- Produces:
  ```ts
  // lib/storage/upload-token.ts
  export function signUploadToken(input: { key: string; maxBytes: number; expiresAt: Date }, secret: string): string;
  export function verifyUploadToken(token: string, secret: string, now: Date): { ok: true; key: string; maxBytes: number } | { ok: false; reason: "malformed" | "bad_signature" | "expired" };
  // Storage additions
  createUpload(key: string, opts: { contentType: string; maxBytes: number; expiresInSeconds: number }): Promise<UploadTarget>;
  head(key: string): Promise<{ bytes: number } | null>;
  putStream(key: string, body: ReadableStream<Uint8Array>, opts: { maxBytes: number; contentType: string }): Promise<Result<{ bytes: number }, "too_large">>;   // local and memory only
  ```
  The token is `base64url(JSON {k, m, e})`, a dot, then an HMAC-SHA256 over that part keyed by `BETTER_AUTH_SECRET`, compared in constant time. It carries the storage key (random per asset) so the route needs no database lookup and no session. The route handler `PUT` returns 403 for a bad or expired token, 409 when `head(key)` already finds an object (single use), 413 when the streamed bytes pass `maxBytes`, 204 on success.

- [ ] **Step 1: Write the failing tests**

```ts
it("signUploadToken and verifyUploadToken round trip; a changed byte, a wrong secret or a past expiry fails with the named reason", ...);
it("local createUpload returns { url: '/api/debrief/upload/<token>', method: 'PUT', headers: { 'content-type': type }, fields: {} } and head sees the object after putStream", ...);
it("putStream stops at maxBytes, removes the partial file and returns too_large, and never trusts Content-Length", ...);   // a request claiming 10 bytes and sending 40 with maxBytes 20
it("the route streams a valid PUT to storage and answers 204; a second PUT with the same token answers 409", ...);
it("the route answers 403 to a missing, forged or expired token and 413 over the cap; it never reads a session", ...);
it("the route answers a cookieless request itself (no redirect to /login)", ...);
it("the proxy matcher excludes api/debrief/upload/ and still covers /jobs/x and /api/auth", ...);   // tests/unit/proxy-matcher.test.ts
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/upload-token.test.ts tests/unit/proxy-matcher.test.ts tests/integration/upload-route.test.ts tests/integration/storage-upload-local.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Read `node_modules/next/dist/docs/` on route handlers and streaming request bodies first. The matcher change is required because, when the proxy runs, Next buffers the request body and silently truncates it past `proxyClientMaxBodySize` (10 MB by default), which would corrupt a 25 MB upload; the existing comment in `proxy.ts` explains the same reason for `api/bridge/`, and the new exclusion gets the same kind of comment. The route reads `request.body` as a stream, counts bytes itself, and aborts the stream past the cap. `local` writes to a temp name then renames, so a half upload is never visible to `head`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/upload-route.test.ts tests/integration/storage-upload-local.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app proxy.ts tests
git commit -m "feat(storage): direct upload target, signed single-use token and streaming route"
```

**Acceptance:** (1) the token is a single-use HMAC keyed by `BETTER_AUTH_SECRET` (spec 5.3); (2) the route never trusts `Content-Length` and enforces the cap while streaming (spec 5.3); (3) the route is excluded from the proxy matcher and answers cookieless calls itself (spec 5.3, same reason as `api/bridge/`).

### Task 38: Blob and S3 upload drivers

**Blocked on (live part only):** `BLOB_READ_WRITE_TOKEN` for the Blob live test and an S3 endpoint with keys (the MinIO container) for the S3 live test. Everything else runs offline.

**Files:**
- Modify: `lib/storage/vercel-blob.ts` and `lib/storage/s3.ts` (from 2026-11-21-jobsmith-prep milestone 7: `createUpload`, `head`), `package.json` (`@aws-sdk/s3-presigned-post`, pinned at install time, version recorded in the report)
- Test: `tests/unit/storage-s3-upload.test.ts`, `tests/unit/storage-blob-upload.test.ts`, `tests/integration/storage-upload-live.test.ts` (skipped without the environment)

**Interfaces:**
- Consumes: `UploadTarget` (Task 37), `@aws-sdk/s3-presigned-post`, `@aws-sdk/client-s3`, `@vercel/blob`
- Produces: `s3.createUpload` returning `{ url, method: "POST", headers: {}, fields }` from a signed POST policy with a `content-length-range` condition of `0` to `maxBytes` and an exact `Content-Type`; `vercel_blob.createUpload` returning a client upload token limited by size and type; `head` on both

- [ ] **Step 1: Write the failing tests**

```ts
it("the S3 policy decodes to a content-length-range of [0, maxBytes], the exact content type and the key, expiring in 900 seconds", ...);   // signing is offline; keys built as "k".repeat(24)
it("S3 head returns { bytes } for an object and null for NoSuchKey", ...);   // client mocked
it("the Blob target limits size and type, makes the object private, and expires with the token", ...);
it("Blob head returns { bytes } or null", ...);
it.skipIf(!process.env.BLOB_READ_WRITE_TOKEN)("a real Blob upload through the target is readable by head and removable", ...);
it.skipIf(!process.env.S3_TEST_ENDPOINT)("a real POST to MinIO succeeds under the cap and fails over it", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/storage-s3-upload.test.ts tests/unit/storage-blob-upload.test.ts`
Expected: FAIL, `createUpload` is not implemented on these drivers.

- [ ] **Step 3: Confirm against current docs, then implement**

Spec: "Milestone 28 confirms the Blob and S3 calls against their current docs." Before writing code, read the current `@vercel/blob` client upload documentation (private access, client token with a maximum size and allowed content types, how to read an object's size) and the S3 presigned POST documentation, and write what you found in the task report. Do not copy call shapes from memory. `createUpload` never creates a public object (spec 7).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/storage-s3-upload.test.ts tests/unit/storage-blob-upload.test.ts && pnpm typecheck`
Expected: PASS (live tests skipped without their environment; run them once when the token or endpoint is available and note it in the pull request)

- [ ] **Step 5: Commit**

```bash
git add lib package.json pnpm-lock.yaml tests
git commit -m "feat(storage): signed upload targets for Vercel Blob and S3"
```

**Acceptance:** (1) S3 signs a POST policy with a `content-length-range` condition (spec 5.3); (2) Blob hands out a size- and type-limited client token (spec 5.3); (3) no object is public (spec 7).

### Task 39: Start and finish an audio upload

**Files:**
- Create: `lib/debrief/audio.ts`
- Modify: `lib/debrief/hosted-port.ts` (`checkQuota(s, bytes)`)
- Test: `tests/integration/debrief-audio.test.ts`, `tests/unit/debrief-audio-checks.test.ts`

**Interfaces:**
- Consumes: `Storage` (Task 37), `sniffAudio`, `m4aDurationMs` and Prep's duration reader (Task 35), `TranscribeDriver` (Task 36), `debriefKeyFor` (Task 2), Prep's `asset` scoped helper, `startTranscription` (Task 40)
- Produces: `startAudioUpload`, `finishAudioUpload`, `AudioError`, the constants in the Contract, `audioObjectKey(userId, ext): string` (`u/<first 16 hex of sha256(userId)>/audio/<random 32 hex>.<ext>`), `checkAudioInput({ name, type, size, maxBytes })`

```ts
export type StartAudioUpload = { opportunityId: string; stageId: string | null; name: string; type: string; size: number; sha256: string; attested: boolean; keepAudio: boolean };
export type AudioDeps = PortDeps & { storage: Storage; transcribe: TranscribeDriver | null; secret: string };
export type AudioError = "stt_off" | "attestation_required" | "audio_type" | "too_large" | "cap_uploads_day" | "quota_storage" | "stage_not_found" | "stage_not_allowed" | "not_found" | "upload_missing" | "upload_mismatch" | "audio_video" | "audio_unreadable" | "audio_too_long";
```

- [ ] **Step 1: Write the failing tests**

```ts
it("refuses with stt_off when transcription is off and with attestation_required when the box is unchecked, before anything is written", ...);
it("accepts .m4a .mp3 .wav .webm .ogg .opus .flac and refuses '.mp4' and '.exe' with audio_type; a declared video/mp4 type is refused", ...);
it("a 30 MB file against TRANSCRIBE_MAX_MB 25 is refused with too_large naming the limit, before any asset is created", ...);
it("the 11th upload of the day is refused with cap_uploads_day", ...);
it("start creates an interview_audio asset with expires_at 24 hours out and a debrief row in status uploading with recording_attested_at and keep_audio, and returns the target for the object key under the user prefix", ...);
it("finish refuses upload_missing when head finds nothing, and upload_mismatch (deleting the object, the asset and the row) on a size or sha256 difference", ...);
it("finish refuses audio_video with 'Upload the audio-only file' for an mp4 brand and audio_unreadable for random bytes, removing the object", ...);
it("finish refuses audio_too_long over 120 minutes by the container's duration", ...);
it("finish reads the duration from the container and starts the transcription run; when the duration is unreadable it reserves from the size at 32 kbps", ...);
it("storage quota refusal (Hosted) returns quota_storage and writes nothing", ...);   // when lib/quota/storage.ts exists
it("another user's debrief id is not_found", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/debrief-audio-checks.test.ts tests/integration/debrief-audio.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`startAudioUpload` runs in one transaction: derive the document key with `debriefKeyFor` (the row stores it in `artifact_key`; the document is created when the transcript arrives), insert the `asset` through Prep's helper, insert the `debrief` row (`input` `audio`, `status` `uploading`, `occurred_at` the stage's `scheduled_at` else now), then call `storage.createUpload(key, { contentType, maxBytes, expiresInSeconds: 900 })`. `finishAudioUpload` reads the object, compares size and sha256, sniffs the first bytes, reads the duration, and starts the run. Every refusal after the object exists deletes the object. `size` is also compared with `asset.bytes`. A missing object at finish is `upload_missing`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/debrief-audio-checks.test.ts tests/integration/debrief-audio.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(debrief): start and finish a recording upload with attestation and checks"
```

**Acceptance:** (1) an attestation on every upload, stored as `recording_attested_at` (spec 5.3, 7); (2) extension, declared type, size, daily count, quota, hash, sniff and duration checks in the order of spec 5.3; (3) a 30 MB file is refused before upload (spec 9); (4) a video brand reads "Upload the audio-only file" (spec 5.3).

### Task 40: `transcribe_audio` run

**Files:**
- Create: `lib/debrief/transcribe-run.ts`
- Modify: `lib/debrief/save.ts` (`appendTranscript` creates the document when none exists), `lib/debrief/hosted-port.ts` (nothing new), `lib/debrief/delete.ts` (nothing yet)
- Test: `tests/integration/debrief-transcribe.test.ts`, `tests/unit/transcribe-reserve.test.ts`

**Interfaces:**
- Consumes: `beginRun`, `endRun`, `afterResponse`, `notifyDebriefReady` (port, Tasks 30 and 32), `getTranscribeDriver`, `segmentsToText`, `appendTranscript` (Task 9), `Storage`, the `asset` scoped helper
- Produces:
  ```ts
  export function startedMinutes(durationMs: number): number;                       // Math.ceil(durationMs / 60_000)
  export function reserveMinutes(input: { durationMs: number | null; bytes: number }): number;   // container duration, else bytes at 32 kbps, both as started minutes
  export async function startTranscription(s: Scoped, debriefId: string, deps: AudioDeps): Promise<Result<{ debriefId: string }, AudioError | SuggestError>>;
  export async function runTranscription(s: Scoped, debriefId: string, deps: AudioDeps): Promise<void>;   // never throws
  export async function retryTranscription(s: Scoped, debriefId: string, deps: AudioDeps): Promise<Result<{ debriefId: string }, AudioError | SuggestError>>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
it("reserveMinutes uses the container duration as started minutes, and 32 kbps from the size when it is unreadable (which over-reserves)", () => {
  expect(reserveMinutes({ durationMs: 50 * 60_000, bytes: 1 })).toBe(50);
  expect(reserveMinutes({ durationMs: null, bytes: 24_000_000 })).toBe(100);   // 24 MB at 32 kbps is 6,000 s
});
it("start sets status transcribing, reserves ceil(minutes/2) credits with units in minutes, and returns at once", ...);
it("success writes one generated version titled '... (transcribed)' with the text under ## Transcript, ingest fills in the row the upload created (one row, input audio), status ready, audio_ms set", ...);
it("success deletes the asset row and the object unless keep_audio; with keep_audio the object stays and expires_at is 30 days after upload", ...);
it("success settles credits from the provider's duration: a provider duration shorter than reserved refunds the difference", ...);
it("success writes a debrief_ready notification", ...);
it("failure (stt_timeout, stt_bad_audio, stt_rate_limited, stt_error) sets failed with the code, refunds everything, keeps the audio and its 24-hour expiry", ...);
it("retryTranscription after a failure needs no new upload and runs again", ...);
it("a daily total over 240 minutes is refused with cap_task_day before any work", ...);
it("an object delete that fails after commit leaves the asset row with expires_at now so the expiry step retries", ...);
it("never throws and never leaves transcribing, even when the driver throws", ...);
it("the prompt sent to the driver holds the company name, the role title and the stage's linked people, and no transcript or file name appears in any log line", ...);   // log spy
it("a transcript for a debrief with no document yet creates the document under the row's artifact_key", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/transcribe-reserve.test.ts tests/integration/debrief-transcribe.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Follow Hosted 5.5 and spec 5.3: readiness, `beginRun({ task: "transcribe_audio", units: reserveMinutes(...) })`, status `transcribing`, then in `afterResponse` read the bytes, call the driver without `fileName` (no column stores the upload's original name, so the fake driver returns its fixed transcript here and reads a named fixture only when a unit test passes `fileName`), write the transcript through `appendTranscript` with origin `generated` inside the same transaction that sets `ready`, `audio_ms` and, unless `keep_audio`, deletes the asset row; after commit delete the object, and on an object-delete failure set the asset's `expires_at` to now. Settlement passes `settleCredits = ceil(startedMinutes(providerDurationMs) / 2)` to `endRun`, which refunds the rest. Log `[stt]` lines with ids, provider, model, bytes, audio milliseconds, run milliseconds and code only.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/transcribe-reserve.test.ts tests/integration/debrief-transcribe.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(debrief): transcribe a recording after the response and delete the audio"
```

**Acceptance:** (1) the lifecycle follows Hosted 5.5 with a refund on failure and the audio kept for 24 hours (spec 5.3, 6); (2) the stored object is gone once the transcript saves unless `keep_audio` (spec 9); (3) the transcript is a `generated` version whose title says transcribed (spec 5.1); (4) reservation from the container duration, settlement from the provider's (spec 5.5).

### Task 41: Expiry, tick step, delete now

**Files:**
- Create: `lib/debrief/expire.ts`
- Modify: `lib/jobs/steps.ts` (from 2026-11-21-jobsmith-hosted milestone 11: an `expireAudio` step, 50 per run), `lib/debrief/delete.ts` (fills the audio seam from Milestone 25), `app/(app)/jobs/[slug]/debrief/[id]/page.tsx` (lazy `expireAudioFor`), `app/(app)/jobs/[slug]/debrief/actions.ts` (`deleteRecordingAction`)
- Test: `tests/integration/debrief-expire.test.ts`, `tests/integration/debrief-delete.test.ts` (new cases), `tests/integration/tick-expire-audio.test.ts`

**Interfaces:**
- Consumes: `Storage.delete`, the `asset` scoped helper, Hosted's tick route
- Produces:
  ```ts
  export async function listExpiredAudio(db: Db, now: Date, limit: number): Promise<{ assetId: string; userId: string; storageKey: string }[]>;   // ids and keys only, the one unscoped read
  export async function expireAudio(db: Db, deps: { storage: Storage; now: () => Date }, limit?: number): Promise<{ deleted: number; rowsRemoved: number }>;   // default limit 50
  export async function expireAudioFor(s: Scoped, deps: { storage: Storage; now: () => Date }): Promise<number>;       // lazy, this user's rows
  export async function deleteRecordingNow(s: Scoped, debriefId: string, deps: { storage: Storage }): Promise<Result<null, "not_found" | "no_recording">>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
it("an unfinished upload older than its expires_at (24 hours) loses its object and asset and its debrief row when no document exists", ...);   // the abandoned-upload line of the Done-when
it("a failed run's audio is removed after its 24 hours; a kept recording after 30 days; an unexpired asset is untouched", ...);
it("one run deletes at most 50", ...);
it("a debrief row that has a transcript document stays when its audio goes, with audio_asset_id null", ...);
it("deleteRecordingNow removes the object and the asset and sets keep_audio false; with no recording it returns no_recording", ...);
it("deleteDebrief removes the document, the rows and any audio object and asset", ...);
it("the tick route, called with the bearer secret and no cookie, runs the expireAudio step", ...);
it("the debrief page's lazy step deletes this user's expired audio and no other user's", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/debrief-expire.test.ts tests/integration/debrief-delete.test.ts tests/integration/tick-expire-audio.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`listExpiredAudio` is the only query in the milestone that reads across users; it selects ids, the user id and the storage key, never content, and each deletion then runs through `scoped(db, userId)`. Delete the object first, then the row; a failed object delete leaves the row for the next run. When Hosted's tick files are absent, skip the `steps.ts` change and rely on the lazy path; say so in the report.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app tests
git commit -m "feat(debrief): expire recordings, tick step and delete the recording now"
```

**Acceptance:** (1) an abandoned upload is gone after a day (spec 9); (2) a kept recording is gone after 30 days (spec 5.3); (3) the tick step deletes 50 per run and the page does the same lazily (spec 5.3); (4) "Delete the recording now" and "Delete this debrief" both remove audio (spec 5.1, 5.3).

### Task 42: Upload field, notice, attestation, states

**Blocked on:** the owner's review of the notice wording. The component reads it from `RECORDING_NOTICE_TEMPLATE`; everything else runs now.

**Files:**
- Create: `lib/debrief/notice.ts`, `components/debrief/upload-field.tsx`, `components/debrief/recording-status.tsx`, `lib/debrief/upload-client.ts`
- Modify: `components/debrief/debrief-entry.tsx` (the "Upload a recording instead" link), `app/(app)/jobs/[slug]/debrief/actions.ts` (`startAudioUploadAction`, `finishAudioUploadAction`, `retryTranscriptionAction`), `app/(app)/jobs/[slug]/debrief/new/page.tsx` (passes the transcription status), `docs/design-system.md`
- Test: `tests/unit/debrief-notice.test.ts`, `tests/unit/upload-field.test.tsx`, `tests/unit/upload-client.test.ts`, `tests/integration/debrief-audio-actions.test.ts`

**Interfaces:**
- Consumes: Tasks 36 to 41, `DEBRIEF_COPY`, `costLine` (port), `AnalysisStatus` polling (Milestone 27 Task 33) or a local copy of its hook when Milestone 27 is absent
- Produces:
  ```ts
  export const RECORDING_NOTICE_TEMPLATE = "Upload only a recording you made of a conversation you took part in, where you were allowed to record it. In many places everyone on a call has to agree before it is recorded. Jobsmith keeps the file private to your account, sends it only to {provider} to turn it into text, and deletes it when the transcript is saved.";
  export const ATTESTATION_LABEL = "I made this recording and was allowed to record it";
  export const KEEP_AUDIO_LABEL = "Keep the recording for 30 days";
  export function recordingNotice(provider: string): string;
  ```
  Copy: refusal over the limit `That file is {size} MB. The limit is {limit} MB.`; video `Upload the audio-only file.`; off `Recordings are off on this server. To transcribe on your own computer, run jobsmith transcribe.`; states `Uploading, {n}%`, `Reading your recording. {n} seconds so far.`; failure `The recording could not be transcribed: {reason}.` with `Try again`; button `Upload and transcribe`; `Delete the recording now`.

- [ ] **Step 1: Write the failing tests**

```ts
it("recordingNotice fills {provider} and the notice sits above the file picker", ...);
it("the checkbox 'I made this recording and was allowed to record it' is required: the button stays disabled and the message names it", ...);
it("'Keep the recording for 30 days' is unchecked by default", ...);
it("a file over the limit is refused in the browser before any request, with the size and limit named", ...);
it("the client computes the SHA-256 with Web Crypto and calls the start action with name, type, size, hash, attestation and keep", ...);
it("uploads to the returned target with PUT headers or POST fields and reports progress; a non-2xx answer shows a failure with Try again", ...);
it("with transcription off the recording link is replaced by the CLI line", ...);
it("while a recording exists 'Delete the recording now' shows and works", ...);
it("announces progress and completion through the live region", ...);
// integration: each action requires the user, validates ids, and maps AudioError codes to plain sentences with no exclamation marks
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/debrief-notice.test.ts tests/unit/upload-field.test.tsx tests/unit/upload-client.test.ts tests/integration/debrief-audio-actions.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

The provider name comes from `providerLabel(config)` (Task 36), so the notice names the configured host. Upload with `XMLHttpRequest` for progress. The upload field is new code (no registry match) and goes in `docs/design-system.md` with its reason. Semantic tokens only; `break-words` on file names.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/debrief-audio-actions.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib components app docs tests
git commit -m "feat(debrief): upload a recording with the notice and attestation"
```

**Acceptance:** (1) the notice sits above the picker and the attestation is required on every upload (spec 5.3); (2) a too-large file is refused in the browser (spec 9, 6); (3) with transcription off the option names the CLI path (spec 6); (4) the notice wording is read from one constant, open for the owner (README).

### Task 43: `jobsmith transcribe`

**Files:**
- Create: `cli/src/commands/transcribe.ts`, `cli/src/notice.ts`, `cli/src/segments.ts`
- Modify: `cli/src/args.ts` (the command and its flags, usage text), `cli/src/main.ts` (dispatch), `cli/src/config.ts` (the acknowledgment field), `scripts/build-cli.mjs` (nothing unless it lists files)
- Test: `tests/unit/cli-args.test.ts` (new cases), `tests/integration/cli-transcribe.test.ts`, `tests/unit/cli-segments.test.ts`

**Interfaces:**
- Consumes: the CLI's `runPush`, `io.fetch`, config helpers (`readCredentials`), the frontmatter and suffix rules in `cli/src/frontmatter.ts` and `suffixes.ts`
- Produces: `jobsmith transcribe <slug> <file> --stage <label> [--stt-url <base>] [--model <m>] [--no-push]`; the endpoint is `--stt-url`, else `JOBSMITH_STT_URL`, else `http://127.0.0.1:8000/v1`; the model defaults to `whisper-1`; it writes `<slug>-debrief-<stage slug>.md` in the current folder with frontmatter `kind: debrief`, `stage: <label>`, `title: Debrief: <label>` and the text under `## Transcript`, then pushes it (the key is `debrief-<stage slug>`, the same as the app's key rule); `--no-push` writes and stops. `CLI_RECORDING_NOTICE_TEMPLATE` in `cli/src/notice.ts` is printed on first use and its acknowledgment stored in the config file; it is a separate constant because the app's notice says the file is kept in the user's account, which is false here (open item for the owner).

- [ ] **Step 1: Write the failing tests**

```ts
it("parses the command, requires slug, file and --stage, and prefers --stt-url over JOBSMITH_STT_URL over the default", ...);
it("posts multipart to {url}/audio/transcriptions with the file, the model and response_format=verbose_json, retries with json on a 400", ...);   // a node http server on 127.0.0.1
it("writes <slug>-debrief-<stage slug>.md with frontmatter and the text under ## Transcript; segments with a pause over 2 seconds start a new paragraph", ...);
it("pushes the file so the app's key is debrief-<stage slug> and the document lands on the stage", ...);
it("--no-push writes the file and sends nothing to the bridge", ...);
it("prints the notice on first use only and records the acknowledgment with owner-only file permissions", ...);
it("an unreachable endpoint prints 'Could not reach the transcription server at <url>.' and exits 1; the audio is never sent anywhere else", ...);
it("cli/src/segments.ts and lib/transcribe/segments.ts give the same text for the same segments", ...);
it("the CLI bundle gains no runtime dependency", ...);   // existing cli-bundle test
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/cli-args.test.ts tests/unit/cli-segments.test.ts tests/integration/cli-transcribe.test.ts`
Expected: FAIL, command not found.

- [ ] **Step 3: Implement**

The CLI is a one-file dependency-free bundle, so `cli/src/segments.ts` is its own small copy of the segment joiner, pinned to the app's by the cross test. Use Node's global `fetch`, `FormData` and `Blob` through `io.fetch`. The recording is read from disk and posted only to the endpoint the user named or the default; nothing is stored server-side but the text. No credits, no upload.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/cli-transcribe.test.ts tests/integration/cli-bundle.test.ts && pnpm cli:build && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cli tests scripts
git commit -m "feat(cli): jobsmith transcribe against an OpenAI-compatible server"
```

**Acceptance:** (1) the flags, endpoint order and default match spec 5.3 and section 11 item 11; (2) the file name, frontmatter and push key match the app's rules (spec 5.3); (3) no credits, no upload, nothing stored server-side but text (spec 5.3).

### Task 44: End to end, live check, docs and ship

**Blocked on (live part only):** the owner's local whisper server for the CLI check; provider keys for the optional real-provider check.

**Files:**
- Create: `tests/e2e/audio.ts` (`makeWav(seconds)`: a valid tiny WAV of silence), `tests/e2e/debrief-upload.spec.ts`, `tests/integration/stt-live.test.ts`
- Modify: `playwright.config.ts` (`debrief-upload` joins the chain's `testMatch`; the web server command gains `TRANSCRIBE_PROVIDER=fake TRANSCRIBE_FAKE_WAIT_MS=1500`), `.env.example`, `README.md` (a Recordings section and the install note for proxies with a body limit), `content/legal/privacy.md` (from 2026-11-21-jobsmith-hosted milestone 11: the transcription provider in the processor table; rows for recordings and transcripts in the data map), `docs/design-system.md`
- Test: the spec and the live test

- [ ] **Step 1: Write the failing specs**

```ts
test("a synthetic recording uploads, transcribes through the fake driver and lands as a transcript with the notice and attestation", async ({ page }, testInfo) => {
  // open /jobs/<slug>/debrief/new, click 'Upload a recording instead', read the notice above the picker
  // choose makeWav(2) as a file, leave the attestation unchecked: 'Upload and transcribe' is disabled; check it
  // see 'Uploading' then 'Reading your recording'; then the review page opens with the transcript under ## Transcript
  // 'Delete the recording now' is not shown after success
  await scanForViolations(page, "debrief upload", testInfo);
});
test("a 30 MB file is refused before upload, with no request to the upload route", async ({ page }) => { /* route spy asserts zero calls */ });
test("phone: the upload field, progress and notice fit 390px", ...);
// stt-live.test.ts: describe.skipIf(!process.env.TRANSCRIBE_BASE_URL || process.env.JOBSMITH_LIVE_STT !== "1")
it("one real transcription of the recording at JOBSMITH_LIVE_STT_FILE returns text and a duration", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:e2e --project=debrief-chromium -g "synthetic recording"`
Expected: FAIL until Tasks 35 to 43 are merged, then it is the wiring check. The abandoned-upload and object-gone lines of the Done-when are integration tests (Tasks 40 and 41) because the browser cannot see storage or advance a day.

- [ ] **Step 3: Fix what the spec finds, update docs and legal text**

README: the Recordings section lists `TRANSCRIBE_*`, says what is stored and for how long (until the transcript saves, 30 days when kept, 24 hours when abandoned), and says a self-hoster behind a proxy with its own body limit raises it. The privacy page gets the provider row and the two data-map rows; the text goes to the owner for review before the hosted launch.

- [ ] **Step 4: Run the full suite, the preview check and the live checks**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: PASS. Then, with the owner at the keyboard: run `jobsmith transcribe <slug> <recording> --stage "Recruiter screen"` against the owner's local whisper server and confirm the file lands in the app as a debrief; this is the success criterion's "one real debrief", recorded in the pull request. With `TRANSCRIBE_BASE_URL`, a key and `JOBSMITH_LIVE_STT_FILE` set, run `JOBSMITH_LIVE_STT=1 pnpm vitest run tests/integration/stt-live.test.ts` once. Deploy the preview and run one upload on desktop and one at 390 px in Chrome and Safari. Record the links and results in the pull request.

- [ ] **Step 5: Commit**

```bash
git add tests playwright.config.ts .env.example README.md content docs
git commit -m "test(debrief): end to end recording upload and the live checks"
```

**Acceptance:** (1) the Done-when sentence passes as specs and integration tests in CI on the fake driver (spec 9); (2) the owner's local whisper server check is recorded in the pull request (spec 1, success criteria); (3) axe clean on the upload state in light and dark (spec 8); (4) the privacy page lists the transcription provider and the two data-map rows (spec 7).
