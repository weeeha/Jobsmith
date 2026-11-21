# Jobsmith Prep: design spec

- Date: 2026-11-01
- Status: draft for owner review
- Scope: cycle 2 of 8 (Prep). Builds on the Core spec, `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`, whose rules stay in force unless a section here says otherwise.
- Replaces: the owner's prep pipeline in the InterviewPreparationsBot folder (`tools/drill_tape.py`, `narrate.py`, `transcripts.py`, `build_site.py`), which turns question-bank markdown into two-voice drill tapes and a static site.
- Visual plan: a "Prep" page in the "JS - Design" Figma file, drafted before each milestone plan, as Core did for Milestone 5.

## TL;DR

- Core gives every interview packet a home as markdown artifacts. Prep makes the question bank usable the day before the call: each question becomes a row the user can hear, drill and mark as shaky, okay or solid, on a phone, offline.
- The question bank grammar the owner already writes (`### N. "Question"` followed by Say, Spine, Follow-up and the rest) is the input. The app parses it the way the drill-tape script does, so existing packets work on day one and the Claude Code skills keep producing the same files.
- Audio is derived and rebuildable. Every spoken segment is one small file, addressed by a hash of provider, voice and text, generated through a TTS interface with four drivers (any OpenAI-compatible server including the owner's local Qwen3-TTS, Gemini, ElevenLabs, fake) and stored behind a storage interface (local disk, S3-compatible, Vercel Blob). With no TTS configured, the player speaks through the browser's own voices, so Prep works with no key, as intake and fit do.
- Three ways to practice: Listen (the whole bank in two voices with a synced transcript), Drill (hear the question, answer into a silent gap sized to the answer, reveal, mark) and Quick-fire (ten questions, five seconds each, spine only).
- A Library keeps answers and stories across jobs. Confidence marks are keyed by the question text, so the same question at two companies shares its history.
- The phone app is the web app installed: a manifest, a service worker and "Save for offline" per job, including its audio and marks made on a plane.
- Prep ships in five milestones, 6 to 10, continuing Core's numbering. Each has a done-when test. Plans are written one milestone at a time.

## 1. Context and goals

Core (cycle 1) is merged and live. A packet of markdown pushed from a folder shows on the job page as Research, Documents and Prep tabs. The Prep tab renders the question bank read-only.

The owner prepares for interviews with a separate pipeline: the question bank is written in a fixed grammar, a Python script turns each question into a two-voice tape (an interviewer voice asks, the owner's voice answers), a second script narrates the pitch and intros, and a static site publishes the tapes with transcripts. It works, and it has four problems Prep solves:

1. It lives outside the app, so the board, the job page and Home know nothing about it.
2. It has no state. Nothing records which answers are solid and which fall apart out loud.
3. The site is online only, and the owner practices on the way to the interview.
4. The TTS vendor is hard-wired. When the Gemini key ran out of credits on 2026-10-24, the tapes moved to a local Qwen3-TTS model through a patched copy of the script in a worktree, never merged.

### Goals

1. Turn a pushed question bank into questions the user can hear, drill and mark, with no change to how the bank is written.
2. Make the day before an interview a loop: Home says which interview is next and how much of its bank is solid, Drill starts with the shaky answers, marks update Home.
3. Keep answers across jobs. The same "tell me about yourself" at the fourth company starts from the best version, with its history.
4. Work on a phone with no connection, including audio.
5. Work with any TTS or no TTS, and with any storage, so a stranger can self-host it and the hosted version can meter it later.

### Non-goals for Prep

A live AI interviewer that listens and follows up (the owner's interview-room exploration; see section 12), in-app generation of answers (cycle 3), debrief suggestions from a transcript (cycle 6), PDF and DOCX export (cycle 5), push notifications (cycle 4 has alerts), editing the question bank as structured rows (the markdown stays the source and is edited where it is written), voice cloning inside the app, narration of research documents, sharing library items between users.

### Success criteria

The five done-when tests in section 9, verified in Chrome and Safari on desktop, at a phone viewport, and once as an installed app on a real phone in airplane mode.

## 2. Principles

Core's seven principles carry over. Prep adds four.

8. **The markdown stays the source. Rows and audio are derived.** A question row can be deleted and rebuilt from its artifact at any time. An audio segment can be deleted and regenerated from its text. Only confidence marks, library items, sessions and recordings are the user's own state, and they survive a rebuild because they key on the question text, never on a row id.
9. **Audio is an enrichment, never a gate.** Every mode works with text alone or with the browser's voices. Generated audio makes it better.
10. **Small files, content addressed.** One segment per spoken block, named by a hash of what produced it. Unchanged text never regenerates, a changed line regenerates one clip, and a phone caches a bank clip by clip.
11. **Draft before build.** Each milestone's screens are drawn on the Figma "Prep" page, states and errors included, before its plan is written. The plan's copy section is binding, as in Milestone 5.

## 3. Architecture

### Stack additions

| Concern | Choice | Self-host note |
|---|---|---|
| Text to speech | `lib/tts`: one `TtsDriver` interface, drivers `openai_compatible`, `gemini`, `elevenlabs`, `fake`. Picked by `TTS_PROVIDER`, off when unset, like `AI_PROVIDER`. | the local Qwen3-TTS server is an OpenAI-compatible endpoint; no key needed |
| Browser voice | the player falls back to the Web Speech API (`speechSynthesis`) when a question has no segments or TTS is off | nothing to install |
| Private files | `lib/storage`: one `Storage` interface, drivers `local` (a directory), `s3` (any S3-compatible endpoint: R2, MinIO, AWS), `vercel_blob` (private), `memory` (tests). Picked by `STORAGE_PROVIDER`, default `local`. The owner's own deployment on Vercel uses `vercel_blob`, decided on 2026-09-18; a Vercel function has no disk that outlives a request, so `local` is refused at boot when `VERCEL` is set. | `local` is the default; a hosted deployment picks `s3` or `vercel_blob` |
| Audio encoding | `lib/audio/encode.ts`: PCM or WAV from a provider becomes mono MP3 at 64 kbps through a pure JavaScript encoder. Providers that return MP3 or Opus are stored as returned. No ffmpeg anywhere. | none |
| Offline | `app/manifest.ts` (Next.js convention), a hand-written `public/sw.js`, Cache Storage for saved jobs, IndexedDB for the offline mark queue, the Media Session API for lock-screen controls | none |
| Playback | one `PlaybackPlan` (a list of steps: speaker, text, segment or browser voice, gap after) drives Listen, Drill and Quick-fire from one client engine | none |

### Module map additions

```
app/(app)/jobs/[slug]/           Prep tab becomes the prep hub; full-screen players at
  listen/ drill/ quick-fire/     /jobs/[slug]/listen, /drill, /quick-fire
app/(app)/library/               library list, item page, library quick-fire
app/(app)/settings/              Voice section (voices, speed, gap factor), storage usage
app/api/assets/[id]/             authenticated, range-capable asset streaming
app/api/bridge/.../audio/        plan and upload endpoints for the CLI
app/manifest.ts, public/sw.js    installable app and offline cache
components/prep/                 hub, question list, mark buttons, confidence summary
components/player/               transcript, controls, drill timer, quick-fire card
lib/prep/                        parse (grammar), rebuild (artifact to rows), marks,
                                 order (drill ordering), gaps, plan (PlaybackPlan)
lib/tts/                         driver, config, the four drivers, gate (duration check),
                                 spoken (markdown to spoken text)
lib/audio/                       encode, wav, duration, segments (hash, store, lookup)
lib/storage/                     driver, local, s3, vercel-blob, memory, keys
lib/library/                     items, promote, usage
lib/offline/                     client: registration, save-for-offline, mark queue
cli/                             jobsmith audio <slug>
```

The rules from Core hold: every `lib/*` function takes a database handle and a user id, routes and actions stay thin, `requireUser()` in every page, action and handler, `lib/pipeline` keeps every stage write, `lib/artifacts` keeps every artifact write. Prep adds one more owner: `lib/prep/marks.ts` is the only writer of confidence marks, and `lib/audio/segments.ts` is the only writer of segments and their assets.

## 4. Data model

Prep adds six owned tables and one column. All follow Core's conventions: uuid primary keys, `user_id` text with an index, `created_at` and `updated_at` as `timestamptz`, reachable only through the scoped helper, one file per table under `lib/db/scoped/`, and a row in the isolation test.

**prep_question** (owned): `opportunity_id` (cascade), `artifact_id` and `artifact_version` (foreign key on `(user_id, artifact_id)` to `artifact (user_id, id)`, cascade; the Core migration already added that unique pair for this purpose), `artifact_key` (the artifact's `key`, copied, because every version is its own artifact row and a rebuild must find the previous version's rows without a join), `stage_id` (nullable, copied from the artifact), `section` (the `##` heading above the question, nullable), `number` (the N in `### N.`), `position` (order in the file), `question`, `question_key` (first 16 hex characters of sha256 over the normalized question text; section 5.1), `blocks` jsonb (ordered `{ label, spoken, text }`), `spine`, `last_line`, `guard` (nullable notes, lifted out of `blocks` for display), `unfilled` (the trailing warning marker was present), `has_answer` (at least one spoken block), `unresolved_includes` (count). Unique on (`artifact_id`, `position`). Indexes on (`user_id`, `opportunity_id`, `artifact_key`) and (`user_id`, `question_key`).

**prep_mark** (owned): `scope` (`job` or `library`), `opportunity_id` (nullable, cascade; set for `job`), `question_key`, `level` (`shaky`, `okay`, `solid`), `marked_at`, `drill_count` (default 0), `last_drilled_at` (nullable). Unique on (`user_id`, `scope`, `coalesce(opportunity_id, '')`, `question_key`) through an expression index. A mark belongs to the question text within one job, so re-parsing a new artifact version never loses it, and the Library reads every job's marks for one `question_key` as that question's history.

**library_item** (owned): `kind` (`answer`, `story`, `intro`, `fact`), `title`, `body_md`, `tags` jsonb (string list, same list rules as preferences: trimmed, deduplicated, at most 20 of 80 characters), `question_key` (nullable; set when promoted from a question), `source_opportunity_id` (nullable, set null), `source_artifact_id` (nullable, set null), `archived_at` (nullable).

**asset** (owned): `kind` (`tts_segment`, `recording`, `other`), `storage_key` (unique; random, never derived from user text), `content_type`, `bytes`, `sha256`, `duration_ms` (nullable), `opportunity_id` (nullable, set null; segments leave it null because they are shared across a user's jobs). Deleting the row deletes the object.

**tts_segment** (owned): `hash` (unique per user; section 5.5), `provider`, `model`, `voice`, `style` (the style version id, a constant in code), `text_chars`, `asset_id` (nullable, foreign key on `(user_id, asset_id)`), `status` (`pending`, `done`, `failed`), `error_code` (nullable), `suspect` (the duration gate did not pass), `attempts`. The spoken text itself is not stored. It is recomputed from the current question rows when a segment needs (re)generating, so a segment no question refers to is simply unused and is removed by "Delete audio".

**prep_session** (owned): `opportunity_id` (nullable, cascade; null for a library session), `mode` (`listen`, `drill`, `quick_fire`), `started_at`, `ended_at` (nullable), `questions` (count), `marked` (count), `meta` jsonb. Ending a drill or quick-fire session on a job also writes one `event` of a new kind, `prep_drilled`, with body "Drilled 10 questions, 4 marked solid", so the timeline shows practice next to interviews.

**profile.prep** (new jsonb column, default `{}`): a versioned document read tolerantly like `preferences`: `version: 1`, `voices { interviewer, candidate }` (provider voice ids, nullable), `speed` (0.8 to 1.5, default 1), `gapFactor` (0.5 to 2, default 1), `browserVoices { interviewer, candidate }` (browser voice names, nullable, stored because the Web Speech API lists voices per device).

`event.kind` gains `prep_drilled`. No other Core table changes.

## 5. Behavior

### 5.1 From a question bank to rows

Parsing runs inside the same transaction that stores a new artifact version of kind `question_bank` or `call_card`, for `pushed`, `pasted`, `manual` and `generated` origins alike. It rebuilds that document's rows from scratch: delete every row with the same `opportunity_id` and `artifact_key`, insert the new version's rows. Marks are untouched because they key on `question_key`.

Existing artifacts are parsed once by `pnpm prep:backfill`, an idempotent script run by hand after the Milestone 6 migration has deployed, in the way Core's import script was. It is never part of a migration, so a parser bug cannot block a deploy. As a safety net, a document of a parsed kind that has no rows shows "Rebuild questions" on the hub, which runs the same parse.

The grammar is the drill-tape script's, made tolerant:

1. A line matching `^### (\d+)\. (.*)$` starts a question. The question text is cut at the first warning marker (U+26A0 U+FE0F) or at the first ` (`, then stripped of surrounding quotes. A marker after the closing quote sets `unfilled`. A marker before the closing quote would have emptied the question in the script; here the question keeps its text and the row is still flagged `unfilled`, with a warning.
2. A `## ` heading ends the current question and names the section of the questions below it. It is never spoken. A `#### ` heading is ignored on purpose; the owner's files use it for application-form fields that must stay off the tape.
3. Inside a question, a bold label at the start of a line opens a block. Spoken labels: `Say`, `Long version`, `Tie to the posting`, `Follow-up ...`, `If she asks ...` and `If he asks ...` (any pronoun), `Step N ...`, `Then, in every case`, `If conversational ...`, `If basic ...`, `If comfortable ...`, a `Fork A` or `Fork B` label, a numbered list label, and an italic `*If ... :*` conditional. Note labels: `Spine`, `Last line`, `Guard`, `Rests on`, `If you lose the thread`, `Why`. An unknown bold label opens a note block and adds a warning naming it, so a new label in the owner's files never silently becomes speech.
4. `Say` is spoken with no label read aloud. Every other spoken label is read by the interviewer voice before the candidate voice reads the text, as the tape does.
5. Lines before the first label inside a question belong to a note block. `---` lines are ignored. Text in a section before its first question is section notes and never spoken.
6. `{{include <file> N [url]}}` is resolved against the artifacts of the same job and company whose key ends with the file name without `.md` and without the owner's company prefix; question N's spoken blocks are spliced in. An unresolved include stays as a note "Includes question N of <file>, not found here" and increments `unresolved_includes`.
7. `question_key` is sha256 over the question text lower-cased, with quotes, punctuation, markers and repeated whitespace removed, first 16 hex characters.
8. A file with no `### N.` heading yields no rows. A `question_bank` then shows the notice "This document has no questions Jobsmith can read. A question is a line like `### 1. "Tell me about yourself"`." A `call_card` shows nothing, because a call card is often facts and a running order with no questions (the repo's own packet fixture is one), and the artifact stays readable as before.

A `pitch` artifact is parsed for Listen only: each `## ` heading starts a chapter spoken in the candidate voice, as `narrate.py` does. Chapters are not questions, get no marks and are not stored as rows; the player plan is built from the artifact at read time.

### 5.2 The Prep hub

The Prep tab on the job page becomes the hub. The document list and the read-only document view stay below it, unchanged. Above them:

- One card per question bank the job has, grouped by stage as today, with: the question count, the confidence summary as three counts with the band words ("12 solid · 6 okay · 4 shaky · 8 unmarked"), the audio status ("Audio ready", "Audio: 61 of 96 clips", "Browser voice", or "Preparing audio"), and the actions Listen, Drill, Quick-fire.
- A "Prepare audio" button when TTS is configured and clips are missing, with the batch progress (section 5.5). When TTS is off, a short line says the player will use the browser's voices and links to Settings.
- "Save for offline" with the size it will take, and "Saved" with the date once cached (section 5.9).
- The bridge panel stays, so pushing a new bank from the terminal is one copy away.
- The question list: section headings, then each question with its number, text, mark chip, an "unfilled" chip when flagged, and a tap target that opens that question in Listen.

A job with research but no question bank shows the empty state "No prep yet. Push a question bank or paste one." with the paste button and the push command.

### 5.3 Listen

Route `/jobs/[slug]/listen?doc=<ref>&q=<N>`, a full-screen player on phone and a centered column on desktop. It plays one bank or one section, in order.

The playback plan for a question: the interviewer voice reads the question, then for each spoken block in source order, the interviewer reads the label when there is one and the candidate reads the text. Gaps: 0.6 seconds between steps inside a question, 1.4 seconds between questions. These are the tape's own numbers.

Controls: play and pause, previous and next question, repeat this question, speed from 0.8 to 1.5 in steps of 0.1 (`playbackRate` for clips, `rate` for browser voices), and the three mark buttons, always visible, marking the current question without stopping playback. The transcript shows the current question's blocks with the playing block highlighted; tapping a block seeks to it; note blocks (Spine, Last line, Guard) show dimmed and are never read. A sticky header shows "Question 7 of 32" and the section name.

Sources per step: a `done` segment plays its clip; a `pending` or `failed` segment, or TTS off, speaks the text through the browser voice chosen in Settings. A mixed bank plays through. The transcript marks browser-spoken steps with a small "browser voice" label so the user knows which clips are missing.

The Media Session API gets the question as title, "Role at Company" as artist, the brand mark as artwork, and play, pause, previous and next actions, so the lock screen works. Playback continues while the screen is off on platforms that allow it; where it does not, the player says so once.

A `pitch` artifact opens in the same player with its chapters as the list.

### 5.4 Drill

Route `/jobs/[slug]/drill?doc=<ref>&section=<name>&n=<count>`. A session is ten questions by default, or one section.

Order: questions with an answer, sorted by level (shaky, okay, unmarked, solid), then by `last_drilled_at` oldest first with never-drilled first, then by position. A session never repeats a question. The order is fixed when the session starts.

One question, one loop:

1. The interviewer voice asks (clip or browser voice). The question text is hidden until asked, then shown.
2. A silent gap starts, with a visible countdown: `clamp(round(sayChars / 13 × 1.2), 15, 120) × gapFactor` seconds, where `sayChars` is the length of the `Say` block, or of the first spoken block when there is no `Say`. The tape's duration gate treats 13 characters per second as the ideal speaking rate, so this is the answer's own length plus a fifth. "Done" ends the gap early. "More time" adds 30 seconds.
3. Reveal: the Spine first (the shape to fall back on), then the Say block plays in the candidate voice with its transcript. Last line and Guard show as notes.
4. Mark: Shaky, Okay or Solid. One tap, large targets, also keys 1 to 3 on desktop. Marking advances to the next question. "Skip" advances without a mark. Each mark also increments `drill_count` and sets `last_drilled_at`.

The session ends with a summary: the marks given, the questions still shaky, "Drill the shaky ones again" (starts a session of just those), and a `prep_drilled` event on the timeline.

Optional, the last task of Milestone 8 and the first cut if it runs long: "Record my answer". During the gap the microphone records; after the reveal the user can play the recording next to the Say clip and keep or discard it. Kept recordings are `recording` assets attached to the job, listed under the question, deletable one by one. Nothing leaves the device unless "Keep" is tapped.

### 5.5 Audio: segments, generation and the duration gate

A segment is the audio for one spoken step: `(speaker, text)`. Its hash is sha256 over `provider | model | voice | style | spokenText`, first 16 hex characters, scoped to the user. The hash leaves out the question number and the job, so reordering costs nothing and the same intro at two companies is one clip. Changing one word regenerates one clip.

`spokenText` is the block's markdown made speakable: bold and italic markers, links (kept as their text), warning markers and emoji removed; list items joined as sentences; `{{include}}` resolved; whitespace collapsed. The label step's text is the label itself with its colon.

Generation never runs on push and never blocks a response. Two paths share one planner, `planSegments(questions, voices)`, which returns the missing hashes with their speaker and text:

- **In the app.** "Prepare audio" calls a server action that generates up to 20 missing segments and returns `{ done, total }`. The hub keeps calling it while clips are missing, with the same 3-second rhythm and ceiling the fit card uses, and shows "Audio: 61 of 96 clips". Each call stays well inside the page's 60-second `maxDuration`.
- **From the terminal.** `jobsmith audio <slug> [--tts-url <base>] [--voice-interviewer <v>] [--voice-candidate <v>]` fetches `GET /api/bridge/opportunities/:slug/audio/plan` (the same planner's output), synthesizes each segment against an OpenAI-compatible endpoint on the user's own machine (default `http://127.0.0.1:8890/v1`, the local Qwen3-TTS server), encodes, and uploads batches of up to 4 MB to `PUT /api/bridge/opportunities/:slug/audio` as `{ segments: [{ hash, contentType, durationMs, base64 }] }`. The server verifies that each hash is in the current plan before storing. This is how a hosted Jobsmith uses a voice that only exists on the owner's laptop. The CLI asks the endpoint for `mp3` first and encodes only a `wav` answer; the pure JavaScript encoder is bundled into the one-file CLI build, which stays dependency-free at install time and grows by roughly 100 KB.

Each generated clip passes the tape's duration gate: for a text of 120 characters or more, characters per second of audio must fall between 5 and 18; for shorter text, duration must fall between 0.5 and 30 seconds. A failing clip is retried once with the provider's stricter instruction ("Read every sentence to the end") where the provider accepts a style; a second failure keeps the clip and sets `suspect`. Suspect clips carry a small "check this clip" note in the transcript and a "Regenerate" action. Duration comes from the PCM length when the provider returns PCM or WAV, otherwise from the encoded file's frame headers; when it cannot be read, the gate is skipped.

The TTS driver interface: `synthesize({ text, voice, style, format }) → Result<{ audio, contentType, sampleRate? }, "tts_timeout" | "tts_bad_output" | "tts_rate_limited" | "tts_error">` and `voices() → Voice[]` (id, label, language). Drivers: `openai_compatible` (`TTS_BASE_URL`, optional `TTS_API_KEY`, `TTS_MODEL`; `POST /v1/audio/speech` with `input`, `voice`, `response_format`; asks for `mp3` and accepts `wav`), `gemini` (`GEMINI_API_KEY`, `TTS_MODEL` default `gemini-2.5-flash-preview-tts`; returns PCM at 24 kHz, wrapped and encoded), `elevenlabs` (`ELEVENLABS_API_KEY`, `TTS_MODEL`, voice ids), `fake` (a valid tiny MP3 whose duration tracks the text length; the default in tests; a `Fake wait: <ms>` line in the text delays the response, as the fit driver's `Fit wait:` does, so pending states can be scanned).

Voices: Settings lists the provider's voices and the user picks Interviewer and Me. Defaults when the provider lists them: `Vivian` and `Ryan` on the Qwen3-TTS server, otherwise the first two voices. Changing a voice does not delete old clips; it starts a new plan, and "Delete audio" on the hub removes segments no current question of any job refers to.

Storage: every object key starts with a per-user prefix, `u/<first 16 hex of sha256(user_id)>/`, so the Hosted cycle's account deletion can list and remove one user's objects without a database join; a segment's key is `u/<prefix>/tts/<random 32 hex>.mp3` (or `.wav` when encoding failed). `Storage` has `put(key, bytes, contentType)`, `get(key) → bytes | null`, `delete(key)`. Clips are small, under 2 MB, so the interface moves whole objects and `GET /api/assets/[id]` serves `Range` requests (206) by slicing in memory, which Safari requires for seeking. Responses carry `Cache-Control: private, max-age=31536000, immutable`, since an asset id never changes its bytes. The route checks the session and loads the asset through the scoped helper, so another user's id is a 404.

Sizes, for the encoding decision: PCM at 24 kHz, 16-bit, mono is 48 KB per second; MP3 at 64 kbps is 8 KB per second. A 40-question bank with about 2,400 seconds of speech is 115 MB as WAV and 19 MB as MP3. The phone budget needs MP3.

### 5.6 Quick-fire

Route `/jobs/[slug]/quick-fire` and `/library/quick-fire`. Ten questions, random order, seeded per session, from the job's banks or from every active job's banks plus library items with a `question_key`. For each: the question (clip or browser voice, text shown), a 5-second countdown, then the Spine. Tap anywhere for the next one. Marks are optional, one tap on the reveal. The round ends with the list of what came up and the marks given. Quick-fire never plays answers. It trains recalling the shape of an answer under time.

### 5.7 Confidence marks

Three levels, `shaky`, `okay`, `solid`, plus no mark. The words carry the meaning and the chips carry a tone the way fit bands do, never color alone. A mark is per question text per job (section 4). Marking the same question in two jobs is two marks; the Library shows both with dates.

Marks are written by `lib/prep/marks.ts` only, from Listen, Drill, Quick-fire, the hub's question list and the offline queue. A mark carries its `marked_at` from the client, because an offline mark is applied later; on conflict the newer `marked_at` wins.

Home's interview item (rule 1 in Core 5.8) adds the confidence summary under the stage line: "12 of 30 solid" (or "No prep yet" with a link to the hub when the job has research but no question bank; "No research yet" keeps priority). The primary action stays "Open prep", which now lands on the hub.

### 5.8 Library

Route `/library`, replacing the Core placeholder. A list of items with kind chips, tags, title, the first line of the body, and "Used in N jobs" computed from `question_key` matches across question rows. Search by text, filter by kind and tag. An item page shows the body rendered, its tags, the source job when it came from one, every job's mark for its `question_key`, Edit (plain text area with preview, as Documents), Archive.

"Save to library" on a question (hub list, Listen, Drill summary) creates an `answer` item from the question's Say and Long version blocks, with the question as title and the job as source. Items of kind `story`, `intro` and `fact` are created by hand from the Library page.

The library quick-fire (section 5.6) and a library drill (`/library/drill`: the same loop as 5.4 over items with a `question_key`, answers spoken from the item body through the browser voice or through segments generated for the item on demand) make the Library a practice set between interviews.

The context document the bridge produces (`jobsmith pull`) gains a `## Prep` section: one line per question with its number, section, mark and last drilled date, and a `## Library` list of titles and tags. The frontmatter version stays `context/v1`; new sections are additive. Skills that rewrite a question bank can then start from the shaky answers.

### 5.9 Phone app and offline

`app/manifest.ts` declares the app (`display: standalone`, `start_url: /`, the theme colour from the semantic tokens, name "Jobsmith"), with maskable 192 and 512 pixel PNG icons and a 180 pixel Apple touch icon generated from `public/brand/mark.svg` at build time by a script in `scripts/`, committed. `app/layout.tsx` adds the viewport and theme-colour metadata.

`public/sw.js` is hand-written and versioned by the build id. It owns two kinds of cache:

- the shell: the player routes' static assets, cached on install, so an installed app opens with no network;
- per-job prep caches, named `jobsmith-prep-<user hash>-<slug>`, filled only by "Save for offline".

"Save for offline" on the hub fetches with credentials and stores: the job's prep manifest (`GET /api/prep/[slug]`: questions, blocks, marks, the playback plan with asset ids), the Listen, Drill and Quick-fire pages, and every `done` segment the plan needs. It shows the total before starting ("38 MB, 96 clips") and the progress while saving. Offline, the service worker answers those requests from the cache, cache-first for assets and the manifest, and the player works as if online. Online, the pages and the manifest are network-first with the cache as fallback. Everything else is network only; the service worker never caches other pages, the board or any API response.

Marks made offline go to an IndexedDB queue and are posted when the browser fires `online` or the app is next opened, through the same mark action, with their original `marked_at`. A small "3 marks waiting to sync" line shows until the queue drains. Sign-out posts a message to the service worker that deletes every cache for that user hash.

Known platform limits, written into the install hint: Safari removes Cache Storage for a site unused for seven days unless the app is installed to the home screen, and background audio behind a locked screen depends on the platform. The hint on the hub explains installing from the share sheet or the browser menu.

### 5.10 Settings

A Voice section: provider status (which provider, or "Off: the player uses your browser's voices"), the Interviewer and Me voice pickers from the provider's list, browser voice pickers from the device's list, speed and gap factor with their defaults. A Storage line: total asset bytes and clip count, and "Delete all audio". Export adds `prepQuestions`, `prepMarks`, `libraryItems`, `prepSessions`, `assets` (metadata only, no bytes) and `ttsSegments`.

## 6. Error handling

- A bank that does not parse keeps its artifact readable and shows the section 5.1 notice. Parsing problems inside a bank (unknown labels, unresolved includes, a misplaced marker) are warnings listed on the hub under "Check the bank", never errors.
- A segment that fails to generate is `failed` with a code; the plan skips it on the next run unless "Regenerate" is tapped, and the player speaks it through the browser voice meanwhile. A provider rate limit (`tts_rate_limited`) ends the batch early and the hub says "Paused, trying again in a minute".
- Storage failures fail the segment, never the question or the page. A missing object for a `done` segment (deleted outside the app) returns 404 from the asset route, the player falls back to the browser voice for that step and marks the segment `failed`.
- Offline: a page the user did not save shows the offline notice with "Open a saved job". A mark that fails to sync stays queued; after 10 failures it is shown with "Retry" and "Discard".
- Microphone permission refused: "Record my answer" hides for the session with a one-line reason.
- Logs: one `[tts]` line per segment with ids, codes, provider, model, voice id, milliseconds and bytes, never the text. One `[prep]` line per rebuild with counts. Playback and marks log nothing.

## 7. Security and privacy

- Every new table is owned and reached through the scoped helper; the isolation test gains cases for each.
- Assets are private. The asset route requires a session and a scoped lookup. Object keys are random. The service worker caches only for the signed-in user and clears on sign-out. The `s3` and `vercel_blob` drivers never create public objects.
- Spoken text is the user's own answers about their own career, which is sensitive. It leaves the server only when `TTS_PROVIDER` is set, to that provider, with no other data. The browser voice never sends anything anywhere. The CLI path sends text only to the endpoint the user names, which defaults to their own machine.
- The service worker is served with `Cache-Control: no-cache` and the content-security headers the Next.js guide lists; the existing `frame-ancestors 'none'` policy stays.
- Microphone access is requested on a user gesture only, and recordings are stored only after "Keep".
- The bridge audio endpoints use bearer tokens, the same rate limit row and the same body caps as push: 4 MB per request, 50 segments per request.

## 8. Testing

Test-driven for everything under `lib/`, as in Core.

- **Unit:** the parser as a table of cases drawn from the grammar: every spoken and note label, the marker before and after the quote, `####` lines, `##` resets, `---`, forks and steps, italic conditionals, includes resolved and unresolved, a `question_bank` with no questions, the repo's packet call-card fixture yielding zero rows and no notice. `question_key` normalization. `spokenText` cleanup. The hash. Drill ordering with a fixed clock. The gap formula at its clamps. The playback plan for a two-question bank with mixed clip and browser steps. The duration gate. WAV wrapping and MP3 encoding on a 1-second fixture. Range slicing. The manifest and the offline queue reducer.
- **Integration (PGlite with the real migrations):** isolation with two users across the six tables and the asset route. Rebuild on a new version keeps marks and drops stale rows. Segment planning skips `done` hashes. The bridge audio endpoints accept only planned hashes. The export includes the new tables and no bytes. The `prep_drilled` event.
- **Storage drivers:** `local` and `memory` in every run; `s3` against a MinIO container and `vercel_blob` against a token only when the environment provides them, as the live AI smoke test does.
- **End to end (Playwright, Chromium and WebKit, desktop and phone):** push a bank with the fake TTS driver, see rows and marks on the hub, prepare audio and watch the count climb, Listen plays two questions with the transcript highlighting, Drill marks a question and the next session starts with it, Quick-fire runs a round, Save to library and drill it from the Library, Save for offline then `context.setOffline(true)` and Listen still plays and a mark syncs after `setOffline(false)`. A `prep-*` project chain runs these after the fit projects, one engine at a time, because they change the shared account's profile voices and preferences.
- **Accessibility:** axe on every new route in light and dark; keyboard-only Drill and Quick-fire (1 to 3 to mark, space to play, arrows to move); live-region announcements for marks and for "Audio ready".
- **Phone:** the Milestone 10 done-when is checked once on a real installed phone app, in airplane mode, and the result is recorded in the PR.

## 9. Milestones

Numbering continues from Core. One implementation plan per milestone, written when the previous one is done, each preceded by its Figma drafts.

| # | Name | Scope | Done when |
|---|---|---|---|
| 6 | Questions | migration for the six tables and the profile column, parser and rebuild on every new version plus the one-time backfill, `question_key`, marks, the Prep hub with its question list and confidence summary, Quick-fire in text mode, Home's "No prep yet" and the confidence line, export additions | A pushed `answers-full` file shows as rows grouped by section with the unfilled ones flagged, a mark survives a second push of the same file, and a Quick-fire round runs with no audio |
| 7 | Voice | `lib/tts` with the four drivers, `lib/storage` with the four drivers and a private Blob store on the owner's Vercel project, `lib/audio` encoding and segments, the asset route with ranges, in-app batches and `jobsmith audio`, Listen with transcript and the browser-voice fallback, the Media Session, the Settings Voice section, pitch chapters | A bank plays end to end in two voices on desktop and phone from the fake driver in CI, and from the local Qwen3-TTS server through the CLI on the owner's machine |
| 8 | Drill | ordering, the gap, reveal, marks in the loop, sessions and the timeline event, the session summary, "Drill the shaky ones again", optional "Record my answer" | After one drill run, the next run starts with the questions marked shaky |
| 9 | Library | `library_item`, Save to library, the Library page with search and tags, "Used in N jobs", library quick-fire and drill, the context document's Prep and Library sections | An answer saved from one job drills from the Library, and `jobsmith pull` lists each question's mark |
| 10 | Phone | manifest and icons, the service worker, Save for offline with size and progress, the offline mark queue, sign-out cache clearing, the install hint | On an installed phone app in airplane mode, a saved job's bank plays, and a mark made offline shows on the desktop after reconnecting |

Each milestone ends with a preview link, a pass in Chrome and Safari and the test suites green.

## 10. Port sources and licensing

| Source | What Prep takes | Where |
|---|---|---|
| InterviewPreparationsBot `tools/drill_tape.py` | the grammar (question heading, spoken and note labels, marker rule), the tape order, the gaps (0.6 and 1.4 seconds), the voices' roles, the duration gate (5 to 18 characters per second, ideal 13), the cache hash idea | `lib/prep/parse.ts`, `lib/prep/plan.ts`, `lib/tts/gate.ts`, `lib/audio/segments.ts` |
| `tools/narrate.py` | `##` chapters as spoken units for the pitch, one voice | `lib/prep/plan.ts` |
| `tools/transcripts.py` | the "audio from an earlier draft" problem, solved here by addressing clips by text hash so a stale clip cannot exist | section 5.5 |
| `tools/build_site.py` | the Listen page's clip layout: title, duration, player, per-speaker transcript turns | `components/player/transcript.tsx` |
| the `audio-notes-voice-clone` worktree of the same repo | a cloned voice as a named voice of the local server, which needs no app change | section 5.5, voices |
| interview-room (`docs/spec.md`) | nothing ported; its `Say → reference answer, Follow-up → hints, Guard → do not say` mapping names the fields a future live interviewer would read from `prep_question.blocks` | section 12 |
| Interview Simulator | nothing ported | |

The scripts carry no license and belong to the owner. Prep re-implements their rules in TypeScript under AGPL-3.0. New dependencies: a pure JavaScript MP3 encoder from the lamejs family (LGPL-3.0, compatible with AGPL-3.0), `@aws-sdk/client-s3` (Apache-2.0), `@vercel/blob` (Apache-2.0). No ffmpeg, no native modules.

Design system: the order of preference from Core section 10 holds. Components with no registry or primitive match (the player controls, the transcript, the mark buttons, the drill timer, the quick-fire card, the confidence summary) are new code, each recorded in `docs/design-system.md` under "New application code" with its reason. `pnpm check:tokens` covers them. Audio controls meet the same contrast and target-size rules as the board.

## 11. Assumed until the owner says otherwise

1. Three mark levels, Shaky, Okay and Solid, with no decay over time.
2. The two voices are called Interviewer and Me, defaulting to `Vivian` and `Ryan` on the Qwen3-TTS server.
3. The drill gap is the Say length at 13 characters per second plus a fifth, clamped to 15 to 120 seconds, times a user factor.
4. Clips are MP3 at 64 kbps mono. Providers that return MP3 or Opus are stored as they are.
5. Milestone order: Voice before Drill, Library before Phone. Drill in text mode would work after Milestone 6, but the owner's practice is by ear, so the voice lands first.
6. "Record my answer" is optional and the first cut.
7. Library kinds are `answer`, `story`, `intro`, `fact`.
8. Offline saving is per job, never the whole account.
9. Parsing also covers `call_card`, because the owner's call cards use the same `### N.` grammar for their short answers; a call card with no questions yields no rows and no notice.
10. The CLI audio command targets an OpenAI-compatible endpoint only. A local Gemini or ElevenLabs run from the terminal is not needed, since those are reachable from the server.
11. The one-time backfill is a hand-run script, and the owner's deployment stores clips in Vercel Blob.

## 12. After Prep

The cycle table in Core section 12 stands. Prep moves these out:

| Item | Where it goes |
|---|---|
| A live AI interviewer that listens, follows up and writes a report (the interview-room exploration) | its own project, or cycle 7 as a bridge consumer of `prep_question.blocks` |
| Reviewing a kept recording against the Say clip with a model | after cycle 6; the Debrief spec lists it as a follow-up milestone |
| Voice cloning inside the app | not planned; a local server can expose a cloned voice as a named voice |
| Editing question banks as rows, or generating missing answers in the app | cycle 3, in-app generation |
| Notifications before an interview ("drill tonight") | cycle 4, alerts |
| Credits and caps on TTS for the hosted version | cycle 3 |
