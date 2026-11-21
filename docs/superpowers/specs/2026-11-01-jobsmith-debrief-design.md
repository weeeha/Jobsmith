# Jobsmith Debrief: design spec

- Date: 2026-11-01
- Status: draft for owner review
- Scope: cycle 6 of 8 (Debrief). Builds on the Core spec, `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`, the Prep spec, `docs/superpowers/specs/2026-11-01-jobsmith-prep-design.md`, the Hosted beta spec, `docs/superpowers/specs/2026-11-01-jobsmith-hosted-design.md`, the Feed spec, `docs/superpowers/specs/2026-11-01-jobsmith-feed-design.md` (for `lib/notify` only), and the Apply and Research spec, `docs/superpowers/specs/2026-11-01-jobsmith-apply-research-design.md`, whose rules stay in force unless a section here says otherwise. It fills the Debrief slot that the Bridge part two spec (cycle 7, `docs/superpowers/specs/2026-11-01-jobsmith-bridge-two-design.md`) leaves in its section 5.4.
- Visual plan: a "Debrief" page in the "JS - Design" Figma file, drafted before each milestone plan.

## TL;DR

- Debrief closes the prep loop. After an interview the user records what happened, Jobsmith proposes what to change, the user accepts, edits or rejects each proposal, and the next Drill starts with what went wrong in the room.
- Three ways in, one document: a quick form (questions asked, 1 to 5, follow-ups promised, next steps heard), pasted notes or a transcript, or an audio recording the user made, transcribed through `lib/transcribe` (an OpenAI-compatible driver that also covers local whisper servers, a gateway driver if AI Gateway routes one, and a fake; off when unset) or on the user's own machine with `jobsmith transcribe`. Each lands as a version of the stage's `debrief` artifact, so the bridge and skills see it.
- Suggestions come from code first. A debrief written in the debrief grammar, by the quick form, by hand or by a Claude Code skill, parses into suggestions with no model. A model run (`debrief_suggest`, 5 credits when hosted) reads free-form notes and transcripts into the same structure, and code checks every quote against the text.
- Nothing applies itself. Apply writes the accepted suggestions in one transaction through the existing owners: marks through `lib/prep/marks.ts`, new questions as a new question bank version through `lib/artifacts` (an "Asked on" section in Prep's grammar), library items through `lib/library`, the next action, stage notes, moves and closes through `lib/pipeline`. Every decision is a `debrief_suggestion` row, so nothing is proposed twice and the model's hit rate shows.
- A new `asked_question` table records which questions were asked in which round and how each went. The Prep hub shows "Asked in Recruiter screen · missed", Drill puts misses first, and Home says "2 questions missed last round".
- `/funnel` shows conversion between stage kinds, time in each stage, response rate after applying, close reasons by stage, and per-company and per-source tables, over this search, 90 days or all time, as pure functions over stage dates and events, with a table twin for every chart.
- Five milestones, 25 to 29. Reviewing a kept practice recording against its Say clip with a model, handed over by Prep, waits until after Milestone 29.

## 1. Context and goals

Core stores a debrief as an artifact of kind `debrief` on the Prep tab (`lib/artifacts/kinds.ts`), rendered read-only, and each stage has free-text outcome notes (`stage.outcome_md`, written by `setStageOutcome` in `lib/pipeline/schedule.ts` from the stage sheet, `components/job/stage-detail-sheet.tsx`). Home's rule 5 lists a scheduled stage whose time has passed, with "Add notes" (`lib/attention/copy.ts`). Prep (cycle 2, specified) turns question banks into `prep_question` rows keyed by `question_key`, keeps confidence marks in `prep_mark` through `lib/prep/marks.ts`, and adds a Library. Hosted (cycle 3) runs in-app model tasks through `lib/generate` and meters them; Feed (cycle 4) adds in-app notifications through `lib/notify`; Apply and Research (cycle 5) adds version compare and a three-way merge in `lib/compare`, and keeps a version's original text in `artifact.source_body_md`.

The owner writes a debrief after every round: what was asked, what landed, what did not, what he promised to send, what happens next. The files sit beside each round's prep packet and push as `debrief` artifacts (the built-in `debrief` suffix, `cli/src/suffixes.ts`), where they change nothing: marks stay where they were, a question asked for the first time never reaches the bank, a promised follow-up lives only in the file, and the stage stays scheduled until the card is dragged. Three handoffs also land here: Hosted moved per-question bank editing to this cycle, Apply moved weekly applications and response rates to the funnel, and Prep moved reviewing a practice recording here (section 12 places it).

### Goals

1. Debrief an interview on a phone in under three minutes right after it ends, with no AI configured.
2. Turn a debrief into concrete changes to prep (marks, new questions, library) and to the pipeline (next action, stage notes, move or close), each approved by the user.
3. Start the next round's prep from the last round's misses.
4. Read a raw transcript or a recording when the user has one, with quotes the user can check.
5. See the whole search as numbers: where jobs stall, how long each stage takes, how often an application gets an answer.

### Non-goals for Debrief

Recording inside the app, meeting bots, calendar or video-call integrations, live transcription or live coaching, speaker identification, transcribing recordings the user did not make, sharing debriefs, benchmarks across users, rewriting existing bank questions in place (the markdown stays the source, Prep's non-goals), drafting thank-you notes in the app, predicting outcomes, reviewing a kept Drill recording against its Say clip with a model (after Milestone 29, section 12).

### Success criteria

The five done-when tests in section 9, verified in Chrome and Safari on desktop and at a phone viewport, plus one real debrief by the owner through `jobsmith transcribe` and his local whisper server, recorded in the Milestone 28 pull request.

## 2. Principles

Core's seven, Prep's four, Hosted's five, Feed's five and Apply's four carry over. This cycle adds five, numbered from 26.

26. **Nothing from a debrief applies itself.** Every suggestion waits for Accept, Edit or Reject. Apply writes only accepted ones, in one transaction, through each concept's own writer, and records every decision.
27. **Quotes are checked in code.** An assessment that cites the transcript carries a quote that code finds in the debrief text. A quote code cannot find is dropped, and the suggestion says so.
28. **The grammar works with no model.** A debrief in the debrief grammar becomes suggestions in code, free, with AI off. The model is for free-form notes and raw transcripts.
29. **Your own recordings only, kept briefly.** An upload needs an attestation, stays private, goes only to the configured transcription provider, and is deleted when its transcript is saved, after 30 days at most.
30. **The funnel is arithmetic.** Every number on `/funnel` is a pure function of stage dates, close reasons and events, shows its count beside any percentage, and is readable as a table.

## 3. Architecture

### Stack additions

| Concern | Choice | Self-host note |
|---|---|---|
| Transcription | `lib/transcribe`: one `TranscribeDriver`, drivers `openai_compatible`, `gateway` (built only if Milestone 28 finds a gateway route for a transcription model), `fake`. Picked by `TRANSCRIBE_PROVIDER`, off when unset, like `AI_PROVIDER` | any whisper server exposing `/v1/audio/transcriptions`; or nothing on the server, with `jobsmith transcribe` on the user's machine |
| Audio upload | straight from the browser to storage: Prep's `Storage` gains `createUpload` and `head` in all four drivers; `local` and `memory` upload through a token route that streams to disk | `local` needs nothing |
| Debrief grammar | `lib/debrief/grammar.ts` and `render.ts`, pure, reusing Prep's question heading rule and `question_key` normalization (`lib/prep/parse.ts`) | none |
| Suggestions model | task `debrief_suggest` in Hosted's `lib/generate`, calling `AiDriver.generate` (`lib/ai/driver.ts`) with a Zod schema on `AI_MODEL` | unmetered on the operator's key; absent with AI off |
| Bank writes | `lib/prep/bank-append.ts`, a `fork` intent in `planUpsert` (`lib/artifacts/plan.ts`), Apply's `lib/compare/merge` | none |
| Funnel | `lib/funnel/`, pure; bars as plain elements on the chart tokens in `app/globals.css`; the registry's `table-view` for tables; no chart library | none |
| Audio checks | `lib/audio/sniff.ts` (magic bytes) and an M4A `mvhd` reader added to Prep's `lib/audio/duration.ts` | none |

New variables, each in `.env.example` with a comment: `TRANSCRIBE_PROVIDER`, `TRANSCRIBE_BASE_URL`, `TRANSCRIBE_API_KEY`, `TRANSCRIBE_MODEL`, `TRANSCRIBE_MAX_MB` (default 25), `TRANSCRIBE_TIMEOUT_S` (default 240). The CLI reads `JOBSMITH_STT_URL`.

### Module map additions

```
app/(app)/jobs/[slug]/debrief/new/    entry: quick form, transcript or notes, recording
app/(app)/jobs/[slug]/debrief/[id]/   status, review, apply, delete
app/(app)/funnel/                     the funnel page
app/api/debrief/upload/[token]/       PUT target for the local and memory storage drivers
components/debrief/                   quick form, upload field and notice, suggestion rows, apply bar,
                                      the Debriefs block on the Prep hub
components/funnel/                    tiles, bar list, table twin toggle, window toggle
components/job/                       + "Debrief this interview" in the stage sheet
lib/debrief/                          grammar, render, clean, truncate, prompt, sanitize, quotes, match,
                                      marks-map, fingerprint, ingest, review, apply, audio, delete
lib/transcribe/                       driver, config, openai-compatible, gateway, fake
lib/prep/                             + asked (asked_question), bank-append, order (the missed tier)
lib/funnel/                           cohort, reach, durations, response, weekly, closes, companies,
                                      debriefs, report, load
lib/storage/  lib/audio/              + createUpload, head; + sniff, M4A duration
lib/artifacts/  lib/pipeline/         + fork intent, deleteDebriefDocument; + appendStageOutcome
lib/generate/tasks/  lib/jobs/        + transcribe-audio, debrief-suggest; + expired assets step
lib/attention/                        + debrief_review, the missed line, the rule 5 change
cli/                                  jobsmith transcribe
```

Core's rules hold: thin routes and actions, `requireUser()` in every page, action and handler, every `lib/*` function takes a database handle and a user id, `app/` and `components/` never import the database client. New owners: `lib/debrief` is the only writer of `debrief` and `debrief_suggestion`, and `lib/prep/asked.ts` the only writer of `asked_question`. `lib/debrief/apply.ts` writes nothing else itself; it calls `lib/prep/marks.ts`, `lib/prep/asked.ts`, `lib/prep/bank-append.ts` (which writes through `lib/artifacts`), `lib/library` and `lib/pipeline` inside one transaction, as Apply's `markApplied` does.

## 4. Data model

Three new owned tables, following Core's conventions: uuid primary key, `user_id` text with an index and cascade, `created_at` and `updated_at` as `timestamptz`, composite foreign keys on (`user_id`, `id`), one file per table under `lib/db/scoped/`, a row in the isolation test. Check constraints list every value from Milestone 25's migration, Feed's rule, so later milestones add columns and never widen a constraint.

**debrief** (owned): one row per analyzed `debrief` artifact version. `opportunity_id` (cascade), `stage_id` (nullable, set null; required before Apply), `artifact_key`, `artifact_id` and `artifact_version` (nullable until a transcript exists; foreign key to `artifact (user_id, id)`, cascade), `input` (`form`, `text`, `audio`, `push`), `analyzer` (`parser`, `model`; nullable before the first ingest), `status` (`uploading`, `transcribing`, `ready`, `analyzing`, `failed`), `error_code` (nullable), `occurred_at` (the interview time: the stage's `scheduled_at`, else the row's creation; editable), `rating` (smallint 1 to 5, nullable), `notes_chars` and `transcript_chars` (what the last model run read), `truncated` (boolean, default false), `reviewed_at` and `applied_at` (nullable). With Milestone 27: `generation_id` (nullable, set null; the latest Hosted `generation` row). With Milestone 28: `audio_asset_id` (nullable, foreign key to `asset`, set null), `audio_ms` (nullable), `recording_attested_at` (nullable), `keep_audio` (boolean, default false). Unique on `artifact_id` where set. Indexes on (`user_id`, `opportunity_id`) and (`user_id`, `status`).

**debrief_suggestion** (owned): `debrief_id` (cascade), `opportunity_id` (cascade), `stage_id` (nullable, set null; copied for fingerprints and stats), `position`, `kind` (`asked`, `library`, `follow_up`, `outcome`, `pipeline`), `analyzer` (`form`, `parser`, `model`), `payload` jsonb (section 5.7, with a `v` field), `edited_payload` jsonb (nullable), `quote` (nullable, at most 240 characters, kept only when code found it), `warnings` jsonb (codes: `quote_not_found`, `low_match`, `date_out_of_range`, `unknown_value`), `question_key` (nullable), `fingerprint` (16 hex, section 5.4), `status` (`pending`, `accepted`, `rejected`, `superseded`), `decided_at`, `applied_at`, `apply_error` (nullable: `stage_gone`, `closed`, `bank_gone`, `invalid`). Unique on (`debrief_id`, `position`). Indexes on (`user_id`, `opportunity_id`, `fingerprint`) and (`user_id`, `status`).

**asked_question** (owned): `opportunity_id` (cascade), `stage_id` (nullable, set null), `debrief_id` and `suggestion_id` (nullable, set null), `question_key`, `asked_text` (at most 300 characters, the interviewer's wording), `outcome` (`held`, `wobbled`, `missed`, `unclear`), `asked_at`. Unique on (`opportunity_id`, `stage_id`, `question_key`); a later Apply for the same stage and question updates `outcome` and `asked_at`. Indexes on (`user_id`, `question_key`) and (`user_id`, `opportunity_id`).

Decision: what happened in the room gets its own table, and `prep_mark` gains no columns. Reason: a mark is the user's confidence and exists only once the user marks (an unmarked question has no row, and `level` is required); one question can be asked in several rounds and at several companies, and the Library needs every ask; keyed by `question_key`, the rows survive a bank rebuild under Prep principle 8. Cost if wrong: Drill and Home join two tables through `lib/prep/asked.ts` where columns would have been one read.

Changes to existing tables:

- `asset.kind` gains `interview_audio`, and `asset` gains `expires_at` (timestamptz, nullable), deleted by the tick (5.3). Objects are keyed `u/<user_hash>/audio/<random 32 hex>.<ext>`, Hosted's prefix rule.
- `profile` gains `search_started_on` (date, nullable), written through `lib/profile`.
- `event.kind` gains `debrief_applied`; the check constraint is rewritten keeping every earlier kind (`prep_drilled`, `artifact_generated`, `posting_gone`, `company_merged`).
- Hosted's `generation.task` gains `transcribe_audio` and `debrief_suggest`, `AI_TASKS` gains `debrief_suggest`, and `credit_ledger.units` holds audio minutes for `transcribe_audio`. Feed's `notification.kind` gains `debrief_ready`, and Feed's channel digests read `feed_items` rows only.
- `artifact` and `stage`: no new columns. `planUpsert` gains a `fork` intent (5.8), `lib/artifacts` gains `deleteDebriefDocument` (5.1), and `lib/pipeline/schedule.ts` gains `appendStageOutcome` beside `setStageOutcome`.
- Export (`lib/export/collect.ts`) adds `debriefs`, `debriefSuggestions`, `askedQuestions` and `profile.searchStartedOn`; `interview_audio` assets appear as metadata only. Its version goes up by one.

## 5. Behavior

### 5.1 The debrief document

One document per interview stage: kind `debrief`, job scope, `stage_id` set, key `debrief-<stage label slug>` (`keyFromTitle`, `lib/artifacts/normalize.ts`; `-2` when another stage already holds that key). Every way in writes a version through `lib/artifacts`: the quick form as `manual`, a paste as `pasted`, a server transcription as `generated` (the app made the text from a provider call; its title says "transcribed"), a CLI or skill push as `pushed`. Any `debrief` version on a stage counts, whatever its key, so a file named by the owner's own suffix works. A debrief pushed without a stage is ingested and asks "Which interview was this?" before Apply.

Ways in: Home's rule 5 item (its action becomes "Debrief"), "Debrief this interview" in the stage sheet, the Debriefs block on the Prep hub, and push. Route `/jobs/[slug]/debrief/new?stage=<id>`; without `stage`, the default is the latest stage whose `scheduled_at` has passed with no debrief, else the current stage. Saved and Applied are never offered. One page with two parts, both optional and at least one filled: the quick form (5.2) and "Transcript or notes", a text area of up to 1 MiB with a file picker for `.txt`, `.md`, `.vtt` and `.srt` read in the browser, plus "Upload a recording instead" when transcription is on (5.3). The body is the form rendered in the grammar, then the pasted text, kept as is when it holds a grammar heading and otherwise placed under `## Transcript`. Saving writes the version and opens `/jobs/[slug]/debrief/[id]`. A transcript that arrives later is appended under `## Transcript` to the latest version as a new version.

Delete: "Delete this debrief" on the review page removes every version of that document, its `debrief` and `debrief_suggestion` rows and any audio, through `deleteDebriefDocument`, the only artifact delete in the app, limited to kind `debrief`. Reason: a transcript holds other people's words, and the user must be able to remove it. `asked_question` rows and anything already applied stay, because they are the user's own record. Cost if wrong: one more kind in the delete allowlist.

### 5.2 The debrief grammar and the quick form

The grammar is markdown with fixed level-2 headings, matched case-insensitively and read tolerantly like Prep's (`lib/debrief/grammar.ts`, pure). `**Rating:** 4/5` sits before the first heading or in a `## Rating` section, and everything after `## Transcript` is transcript, ignored by the parser and read by the model. The other headings:

- `## Asked` (also "Questions asked"): each question is a `### N. "Question"` heading under Prep's rule 1, or a list item holding a quoted question. Labels under it: `**Went:**` with `held`, `wobbled` or `missed` (also `landed` and `good` for held, `shaky` and `okay` for wobbled, `blanked` and `bad` for missed; anything else reads `unclear` with `unknown_value`), `**Why:**` (a span in double quotes inside it is the quote, checked against the transcript as model quotes are), `**Said:**` (what the user answered), `**Spine:**` (for a question new to the bank).
- `## Landed` (also "What worked"): list items; `- **Title:** text` proposes a library story.
- `## Did not land` (also "What did not work"): list items, carried into the stage notes.
- `## Follow-ups`: list items, each with an optional ISO date at the end, as `(due 2026-11-04)` or `· 2026-11-04`.
- `## Next steps`: `**Next:**` with `next round`, `waiting`, `rejected` or `withdrawn`, then free text.

Any other text is the user's notes: never parsed, and sent to the model as notes when the user asks for a model run.

The quick form is a typed editor for the same grammar (`lib/debrief/render.ts`), laid out for a phone right after the call: How it went (1 to 5, a radio group with a word per value); Questions asked (a combobox over the job's bank questions with search, plus "Add a question they asked" as free text, each with Held, Wobbled and Missed); Follow-ups promised (text and an optional date, up to 6); Next steps heard (the four values and a line of text); Anything else. Copy is fixed in the Milestone 25 plan. A unit test renders every field and parses it back to the same suggestions. Decision: one grammar for the form, hand-written debriefs and skills. Reason: the form needs no second code path, a skill gets free suggestions by writing the same headings, and the document stays readable to the user and to the owner's skills. Cost if wrong: if the owner's debrief skill cannot adopt the headings, its files go through the model run and the grammar stays the form's format.

### 5.3 Recordings and transcription

`TranscribeDriver.transcribe({ audio, contentType, language?, prompt? }) → Result<{ text, segments: { startMs, endMs, text }[] | null, durationMs: number | null, modelId }, "stt_timeout" | "stt_too_large" | "stt_bad_audio" | "stt_rate_limited" | "stt_error">`, plus `maxBytes`. `parseTranscribeConfig` reads the variables the way `parseAiConfig` does (`lib/ai/config.ts`). Drivers: `openai_compatible` takes `TRANSCRIBE_BASE_URL`, optional `TRANSCRIBE_API_KEY`, `TRANSCRIBE_MODEL` (default `whisper-1`); `POST {base}/audio/transcriptions` as multipart with `file`, `model`, `response_format=verbose_json` (falling back to `json` on a 400), and `prompt` holding the company name, the role title and the names of people linked to the stage, which helps spelling; it covers OpenAI and the local whisper servers that expose the route. `gateway` is AI SDK transcription through AI Gateway with zero data retention, built only if Milestone 28 finds a transcription route in the current gateway docs; otherwise the hosted deployment runs `openai_compatible` against a provider named on the privacy page. `fake` returns the fixture in `tests/fixtures/debrief/` named by the uploaded file's base name, else one fixed fictional transcript, after `TRANSCRIBE_FAKE_WAIT_MS` (default 0) so pending states can be scanned.

Decision: uploads go straight to storage. Reason: a Vercel function accepts about 4.5 MB per request, and 50 minutes of speech at 64 kbps is about 24 MB. Prep's `Storage` gains `createUpload(key, { contentType, maxBytes, expiresInSeconds: 900 }) → { url, method, headers, fields }` and `head(key) → { bytes } | null`: `vercel_blob` hands the browser a client upload token limited by size and type, `s3` signs a POST policy with a `content-length-range` condition, `local` and `memory` return `PUT /api/debrief/upload/[token]`, which streams to disk under the same cap and never trusts `Content-Length`, with a single-use token that is an HMAC over the asset id and expiry keyed by `BETTER_AUTH_SECRET`. Milestone 28 confirms the Blob and S3 calls against their current docs. Cost if wrong: a self-hoster behind a proxy with its own body limit raises it, as the install notes will say.

Flow: the browser computes size and SHA-256 (Web Crypto) and calls `startAudioUpload` with name, type, size, hash, the attestation and "Keep the recording for 30 days". The action requires the attestation and checks the extension and declared type (`.m4a`, `.mp3`, `.wav`, `.webm`, `.ogg`, `.opus`, `.flac`), the size against `TRANSCRIBE_MAX_MB` (default 25, the OpenAI limit; at most 200), 10 uploads per user per day, and Hosted's storage quota. It creates the `asset` (`interview_audio`, `expires_at` 24 hours out) and the `debrief` (`uploading`). `finishAudioUpload` checks `head`, reads the object, compares size and hash, sniffs the first bytes (ID3 or an MPEG frame sync, `ftyp` with an audio brand, `RIFF....WAVE`, EBML, `OggS`, `fLaC`; a video brand gets "Upload the audio-only file"), reads the duration from the container, refuses more than 120 minutes, and starts `transcribe_audio`.

The run follows Hosted 5.5: readiness, reservation when hosted, status `transcribing`, then in `after()` the bytes go to the driver with `TRANSCRIBE_TIMEOUT_S`, and one transaction writes the transcript as a new `generated` version (segments joined, a paragraph break at pauses over 2 seconds, no timestamps), ingests it (5.4), sets `ready`, and deletes the audio row and object unless `keep_audio`, which moves `expires_at` to 30 days after upload. A failure sets `failed` with its code, refunds, and keeps the audio until its 24-hour expiry so "Try again" needs no new upload. The maintenance tick (Hosted 5.13) gains a step deleting expired assets, 50 per run, and the debrief page does the same lazily. "Delete the recording now" shows while one exists.

The CLI keeps audio on the user's machine: `jobsmith transcribe <slug> <file> --stage <label> [--stt-url <base>] [--model <m>] [--no-push]` posts the file to an OpenAI-compatible endpoint (`--stt-url`, else `JOBSMITH_STT_URL`, else `http://127.0.0.1:8000/v1`), writes `<slug>-debrief-<stage slug>.md` with frontmatter (kind `debrief`, stage) and the text under `## Transcript`, and pushes it. No credits, no upload, nothing stored server-side but text. It prints the notice below on first use and records the acknowledgment in its config file.

The notice sits above the file picker (final wording in the Milestone 28 plan, after the owner's review): "Upload only a recording you made of a conversation you took part in, where you were allowed to record it. In many places everyone on a call has to agree before it is recorded. Jobsmith keeps the file private to your account, sends it only to {provider} to turn it into text, and deletes it when the transcript is saved." The checkbox "I made this recording and was allowed to record it" is required on every upload, and its time is stored as `recording_attested_at`. The feature is framed as the user's own recording of the user's own interview throughout: no recorder in the app, no meeting bot, no import from a link or a shared drive.

### 5.4 From a debrief version to suggestions

Ingest (`lib/debrief/ingest.ts`) runs inside the transaction that writes any `debrief` version, for every origin, as Prep's parse does for banks, and again after an in-place edit:

1. Find or create the `debrief` row for the artifact row; an in-place edit reuses it, and a transcription fills in the row its upload created.
2. Parse the grammar. Grammar content becomes suggestions with analyzer `form` when the version came from the quick form, else `parser`, and sets `rating`.
3. Supersede: every `pending` suggestion of earlier debriefs on the same stage, and of this debrief from an earlier ingest, becomes `superseded`.
4. Fingerprint each new suggestion: the first 16 hex characters of sha256 over kind, stage id and a normalized target (`asked`: the question key; `library`: the title; `follow_up`: the text; `outcome`: the summary; `pipeline`: action and target). One that matches an `accepted` or `rejected` suggestion on the same job is dropped. The stage id in the fingerprint lets a question asked again in a later round be proposed again.
5. Insert the rest in group order. Form suggestions start `accepted`, since the user typed them; parser and model suggestions start `pending`.

A version with no grammar content and at least 200 characters of notes or transcript offers "Get suggestions" when AI is on (5.5); with AI off it offers the quick form, whose save adds the form's sections above the existing text as a new version.

Mark proposals come from code (`lib/debrief/marks-map.ts`), from each ask's outcome and the current mark of its `question_key` in this job:

| Went | Unmarked | Shaky | Okay | Solid |
|---|---|---|---|---|
| held | okay | okay | solid | no change |
| wobbled | shaky | no change | no change | okay |
| missed | shaky | no change | shaky | shaky |
| unclear | no change | no change | no change | no change |

Decision: a held answer raises the mark one step and never reaches solid from unmarked. Reason: one good answer in the room is strong evidence, and "solid" stays the user's call after practice. Cost if wrong: one table.

### 5.5 The model run

"Get suggestions" (until cycle 7 adds its Where choice, 5.11) starts Hosted's lifecycle (`startGeneration`, `lib/generate/start.ts`) with task `debrief_suggest`: readiness (AI on, 200 characters or more, fewer than 2 runs running), reservation when hosted, status `analyzing`, then in `after()` one `AiDriver.generate` call with a Zod schema on `AI_MODEL`, `maxOutputTokens` 6,000 and `timeoutMs` 120,000, then sanitize and ingest the result as analyzer `model` through the same supersede and fingerprint steps, and set `ready`. A failure refunds, keeps any parser suggestions, and shows the code with "Try again". "Analyze again" is allowed on the same version at the same price; fingerprints keep decided suggestions from coming back. A finished run, transcription included, writes a `debrief_ready` notification through `notify` (`lib/notify/write.ts`), in-app only. Until Feed ships, Home's review item is the signal.

Decision: `AI_MODEL` (Haiku 4.5 by default). Reason: grading and matching are extraction, the drafts are short, and the quote and id checks catch invention. Cost if wrong: one task constant moves it to Hosted's writing model at about 10 credits, once that model accepts a schema through the driver.

Input (`lib/debrief/prompt.ts`). The body splits at `## Transcript`. Notes are the text before it, at most 8,000 characters, cut at a line end with "[notes cut]". The transcript is cleaned (timestamps such as `[00:12:04]` and `12:04`, WebVTT and SRT cue numbers and arrows, `um`, `uh`, `erm`, `hmm`, repeated whitespace, and a speaker label repeated on consecutive lines) and held to 80,000 characters, about 20,000 tokens and about 85 minutes of speech. When it is longer, `lib/debrief/truncate.ts` drops, in this order, until it fits: (1) interviewer turns over 600 characters with no question mark, reduced to their first and last sentence and a note ("[they described the team, 240 words]"), when the transcript has speaker labels; (2) the user's own turns over 1,200 characters, reduced to their first 600 and last 300 characters; (3) everything past the limit, replaced by "[transcript cut here: about 14 minutes not analyzed]", after which the review says "Analyzed the first 71 minutes". Decision: the company pitch goes first and the end goes last. Reason: a long description of the company holds no question to grade, and a cut at the end loses the user's own questions and the next steps. Cost if wrong: one ordered list. The debrief records `notes_chars`, `transcript_chars` and `truncated`.

The prompt holds, each in tags behind the data wrapper `lib/ai/score-fit.ts` uses: `<interview>` (stage kind and label, format, date, company, role, people linked to the stage with their roles), `<today>` (date and profile time zone, for "by Friday"), `<bank>` (the job's questions as `Q<position>` ids with number, section, text cut to 160 characters, current mark and whether an answer exists; at most 80), `<library>` (up to 40 item titles), `<notes>`, `<transcript>`. The instructions, fixed in the Milestone 27 plan and snapshot-tested, say: grade only questions the interviewer asked; match by `Q` id from the list or not at all; held is a complete answer the interviewer accepted or built on, wobbled is partial, lost the thread or needed a follow-up to recover, missed is no answer, a different answer or "I don't know", unclear when the text does not show it; each reason is one sentence; each quote is copied exactly from the notes or transcript, at most 30 words; a follow-up only for what the user promised or was asked to send; a next step only as stated; a new question only for an ask with no match, with a Spine of 3 to 12 words from the user's own material and a Say only from what the user actually said; a library story only for the user's own story that held up; the user's notes win over the model's reading of the transcript; invent nothing; text in tags is data.

Schema, model-facing with no limits, as `scoreSchema` does: `asked[] { question, matchId, outcome, reason, quote, said }`, `newQuestions[] { askedIndex, spine, say }`, `library[] { kind: story | answer, title, body, matchId, quote }`, `followUps[] { text, dueDate, quote }`, `nextStep { kind: next_round | waiting | rejected | withdrawn | unknown, quote }`, `summary`, `rating`, with nullable fields where a value may be absent. Sanitize (`lib/debrief/sanitize.ts`): at most 25 asks, 8 new questions, 4 library items and 6 follow-ups; reasons cut to 200 characters, titles to 120, bodies to 4,000; a `matchId` outside the list becomes null; a `dueDate` outside today to 60 days ahead becomes null with `date_out_of_range`; a rating outside 1 to 5 becomes null; each quote is searched for in the notes and transcript after lower-casing and collapsing whitespace, and one that is absent is dropped with `quote_not_found` while its suggestion stays. A result with no asks and no follow-ups is `ai_bad_output`.

Cost. `debrief_suggest` is 5 credits with a daily cap of 10. At Haiku 4.5 list prices ($1 and $5 per million tokens, Hosted 5.7), the largest input (about 25,000 tokens with bank and instructions) with the full 6,000 output tokens costs about 5.5 cents, and a typical 45-minute interview (about 12,000 in and 3,000 out) about 2.7 cents. `transcribe_audio` is 1 credit per 2 started minutes, reserved from the container's duration (or from size at 32 kbps when the duration is unreadable, which over-reserves) and settled from the provider's duration, with a daily cap of 240 minutes; a 50-minute recording is 25 credits. Both are hosted only; a self-hosted copy runs `freeMeter` and still writes `generation` rows.

### 5.6 Matching asked questions

`lib/debrief/match.ts`, pure. Candidates are the job's `prep_question` rows from the latest version of each bank, then library items with a `question_key`. Equal normalized text (Prep 5.1 rule 7) means equal keys and similarity 1. Otherwise the score is the Dice coefficient over word sets after a fixed English stop-word list: 0.75 or more is a match, 0.45 to 0.75 a match with `low_match` ("Check this match"), and below 0.45 no match, with the three best candidates above 0.25 offered in Edit. A model `matchId` is used when it names a candidate and gets `low_match` when the code's score is under 0.3. An unmatched ask takes the `question_key` of its own text. Matching stays inside the job and the Library, since another job's bank is prep for another company.

### 5.7 Review

Route `/jobs/[slug]/debrief/[id]`. The header shows the stage, the date (editable), the rating, the source ("From your quick form", "From your debrief", "Suggested by AI from 52 minutes of transcript"), the truncation line and the document link. The page covers the whole document: it lists the suggestions that are not superseded from every `debrief` row with the same job and `artifact_key`, so a form saved before its transcript arrived stays in one review. While `uploading`, `transcribing` or `analyzing`, the page polls every 3 seconds up to 110 times (Hosted's rhythm) with the elapsed time; `failed` shows the reason with "Try again".

Groups in order, each with its count and "Accept all":

- **Asked**: "They asked: 'How do you decide what not to build?'" with the match ("Question 12 in Questions for Recruiter screen") or "Not in your bank", the outcome word, the reason and the quote, and what Accept will do: record the ask, change the mark ("okay to shaky", or "Already shaky"), and for an unmatched ask add it to a named bank with its draft block shown. Edit changes the match (a combobox of the job's questions, or "Not in the bank"), the outcome (the mark proposal follows the table), the mark or "Leave the mark", and the new question's text, Spine, Say and bank, or "Do not add to the bank".
- **Library**: a new story or answer, or "Add to <item>" when an item matches its title or `question_key` at 0.6 or more. An answer the user gave in the room to a question flagged unfilled becomes an `answer` item for that `question_key`; by design, that fulfills Hosted's "fill one unfilled answer" handoff. When a Library `answer` item exists for a question's `question_key`, the Prep hub shows "Answer in Library" on that question in place of the unfilled chip, derived at read time with nothing written to the bank, and the bank text stays unchanged until a skill rewrites it.
- **Follow-ups**: text and date.
- **Stage notes**: the summary, the rating and the "Did not land" lines as one block.
- **What's next**: "Move to Hiring manager" (next round), "Close as rejected" or "Close as withdrawn". "Waiting" becomes a follow-up "Follow up on Recruiter screen" dated `attention.followUpDays` after the interview (Core 5.7).

Payloads, `v: 1`: `asked { askedText, outcome, reason, match: { questionKey, artifactKey, number, questionText, similarity } | null, candidates[], markTo, newQuestion: { question, spine, say, bankKey } | null }`, `library { mode: create | append, itemId, kind, title, bodyMd, questionKey, tags }`, `follow_up { text, dueOn }`, `outcome { rating, summaryMd }`, `pipeline { action: move | close, kind, reason }`. An edit is stored as `edited_payload` and validated by the same Zod schemas.

Accept and Reject save `status` and `decided_at` at once, so a review survives a reload or a move from phone to desktop; nothing else is written yet. A sticky bar, "Apply 6 changes", runs Apply over accepted rows with no `applied_at`. "Done reviewing" sets `reviewed_at` and leaves pending rows pending. Each row shows its target's state when the page renders (today's mark, today's next action), so a mark changed in Drill since the analysis is visible before Apply. Keyboard: buttons are in tab order, and `a`, `e` and `r` act on the focused row, listed in the shortcuts sheet. Phone: rows stack with full-width buttons, and the bar sits above the bottom navigation with `pb-safe`.

### 5.8 Apply

`applyDebrief(s, debriefId)` covers the same document the review shows. It locks the opportunity (`lockById`), then the document's debrief rows, requires a stage, and walks accepted, unapplied suggestions in position order, each owner's own `transaction` call becoming a savepoint:

- `asked`: upsert the `asked_question` row (`asked_at` from the debrief's `occurred_at`); set the mark through `lib/prep/marks.ts` with `marked_at` now and `drill_count` untouched (a mark equal to the current level writes nothing); collect the new question for its bank.
- `library`: create the item through `lib/library` with the job and artifact as source, or append to the matched item after a blank line under "From the Recruiter screen at Northwind, 3 Nov 2026:".
- `follow_up`, `outcome` and `pipeline`: collected for the steps below.

Banks: one new version per bank with collected questions (`lib/prep/bank-append.ts`). The section heading is `## Asked on 3 Nov 2026, add to the bank` (the date in the profile time zone), followed by one section note, "From the Recruiter screen debrief.", and a `### N.` block per question in Prep's grammar, numbered from the latest version's highest N plus one. With a Say: `**Say:**`, `**Spine:**` and `**Why:** Asked in the Recruiter screen; it held up.` Without one: the warning marker (U+26A0 U+FE0F) after the closing quote, so Prep flags the row unfilled, then `**Spine:**` and `**Why:** Asked in the Recruiter screen. Write the Say block.` When the latest version already ends under the same heading, the blocks join it. The bank is the one on the next interview stage after the debriefed one, else the one on the debriefed stage, else the job's most recently updated bank, else a new document `asked-questions` ("Questions asked in interviews", unstaged). The write is a manual version with the new `fork` intent: `planUpsert` forks even when the latest is unsent, sets `edited_at`, and sets Apply's `source_body_md` to the body it started from at write time; Prep's parser runs in the same transaction. That makes `fork` the one writer of `source_body_md` besides `saveArtifactEdit`, and Apply and Research section 4 is amended with this cycle to list it. When the latest version is newer than the one the review previewed, `lib/compare/merge` merges the approved change onto it (base the previewed version, mine the previewed version plus the section, theirs the latest), and when both sides added lines at the end it places theirs first, since neither replaced a line.

Decision: a forked, edited version. Reason: the version list shows what the debrief added and Compare (Apply 5.3) shows it as one change; a re-push of the old bank text is `unchanged` under Core rule 3, because a manual version leaves the newest pushed version as the reference; a rewritten bank pushed later carries "Pushed after you edited version 5" (`versionNotice`), and Apply's carry-forward moves the section onto it with the pre-debrief bank as the merge base. The Prep tab shows that carry offer above such a bank, as Apply's Documents tab does. Cost if wrong: an in-place edit would hide the change from the version list; switching is one intent flag.

Next action: one write through `setNextAction` (`lib/pipeline/next-action.ts`). The text is the accepted follow-ups in date order joined with "; ", then the current next action if it is not among them, cut at 300 characters with "(+2 more in the debrief)". The date is 09:00 in the profile time zone on the earliest due day (no date counts as tomorrow), or the current next action's date when that is earlier. Decision: one next action. Reason: Core holds one per job and Home surfaces it; a task list is a concept the app does not have. Cost if wrong: a later `follow_up` table seeded from the accepted rows.

Stage notes: `appendStageOutcome(s, opportunityId, stageId, block)` runs one `UPDATE stage SET outcome_md = coalesce(outcome_md || E'\n\n', '') || $1`, so a save from the stage sheet at the same moment is never half merged; `setStageOutcome` stays the sheet's writer. The block opens "Debrief 3 Nov 2026: 4 of 5." and adds the summary and the "Did not land" lines.

Pipeline, last: a move through `moveOpportunity` with the kind of the next non-skipped stage after the debriefed one, a close through `closeOpportunity` with its reason. A closed job skips the move with `apply_error` `closed`.

A row whose target is gone (`stage_gone`, `bank_gone`, `invalid`) is skipped with its code and the rest apply; the toast names the skipped rows. Applied rows get `applied_at`, the debrief gets `applied_at`, and one `debrief_applied` event is written ("Debrief of Recruiter screen: 3 marks, 2 new questions, next action set"; wording in `lib/pipeline/event-text.ts`, fixed in the plan) with meta `{ debriefId, stageId, counts }`. A second Apply finds nothing unapplied and writes nothing.

### 5.9 Prep and Home after a debrief

No Prep column changes. `lib/prep/asked.ts` reads `asked_question` for:

- **The hub** (Prep 5.2): a question asked in this job shows "Asked in Recruiter screen · missed" from its latest ask (the outcome word carries the meaning; the tone follows the mark chips), and "Asked at 2 other companies" from other jobs' rows with the same key. A Debriefs block lists the job's past interview stages with "Debrief" or the latest debrief's state ("4 to review", "Applied 3 Nov").
- **Drill** (Prep 5.4): ahead of Prep's order, a first tier of questions whose latest ask in this job was `missed` and that were not drilled since (`prep_mark.last_drilled_at` empty or earlier than `asked_at`), then `wobbled` by the same rule, oldest ask first. `/jobs/[slug]/drill?missed=1` drills that tier alone. Drilling a question after the ask takes it out of the tier, so a miss leads once.
- **Home** (Core 5.8, Prep 5.7): an interview item adds "2 questions missed last round" when the job's first tier holds questions with an answer, and its action becomes "Drill missed". Line order: "No research yet", "Research is N days old" (Apply and Research 5.5), "No prep yet", the missed line, the confidence summary. Rule 5 leaves out a stage that has a debrief and offers "Debrief" for the rest. A new kind, `debrief_review`, sits after `due`: a `ready` debrief with no `reviewed_at` and at least one pending or unapplied accepted row ("Review the Recruiter screen debrief", "9 suggestions", action "Review"). `AttentionJob` gains `missedToDrill` and `pendingDebrief`, and `AttentionStage` gains `debriefed` (`lib/attention/items.ts`), so `attentionItems` stays one pure function.
- **The Library** (Prep 5.8): an item page lists "Asked in interviews" for its `question_key`, with company, stage, date and outcome.

### 5.10 Funnel

Route `/funnel`, in the sidebar after Board and under More on a phone (`components/app-shell.tsx`). Decision: its own route. Reason: Home lists what to do today and the board is the live pipeline; the funnel looks back over a window, carries several tables and needs a URL for its window. Cost if wrong: Home or Board embeds the same components.

Window: `?window=search|90d|all`, default `search` when `profile.search_started_on` is set, else `90d`. The cohort is the jobs whose start (the earliest `entered_at` among their stages, else `created_at`, so imported jobs keep their own dates) falls in the window, with day boundaries in the profile time zone. "This search started on 1 Sep 2026" with Edit sets the date.

Definitions (`lib/funnel/*`, pure over opportunity, stage, event and artifact rows, no model):

- **Reached**: a job reached a kind when its furthest stage with an `entered_at` is that kind or later in column order (Core 5.1), so a round the company skipped does not lower a conversion. Accepted (closed with `accepted`) is a row after Offer.
- **Conversion**: reached the next kind over reached this kind, as a percentage when the denominator is 10 or more and as "3 of 7" below that.
- **Time in stage**: per kind, the median of whole days from `entered_at` to `completed_at`, or to `closed_at` for the stage a job closed at; open stages show as "5 still here" and stay out of the median; fewer than 3 values read "Too few to tell".
- **Response after applying**: of jobs that reached Applied, responded (reached an interview kind, or closed `rejected` at Applied), no response (closed `ghosted` at Applied, or active at Applied with no event for 30 days), waiting (the rest). The rate is responded over responded plus no response. Median days to a first response run from Applied's `entered_at` to the next stage's `entered_at` or the rejection.
- **Applications per week** (Apply's handoff): Applied `entered_at` by ISO week in the profile time zone (`lib/time/zone.ts`), at most 26 bars, by month for longer windows; and the response rate split by `opportunity.source` and by whether a CV was recorded as sent. A `document_sent` event's meta holds `{ key, version, title }` (`lib/artifacts/sent.ts`), plus `format` and `exportId` from Apply and Research, and no kind, so the funnel resolves the kind by joining `artifact` on (`opportunity_id`, `key`, `version`); no schema change is needed. A split by CV version is left out, because each job's CV is its own key and versions share no identity across jobs.
- **Where jobs closed**: closed jobs by the kind of `closed_stage_id` and by `closed_reason`; jobs closed at Saved read "Dropped before applying".
- **By company**: one row per company in the cohort with jobs, furthest kind, outcomes and days active.
- **Debriefs**: debriefs per stage kind with the average rating; the 10 questions asked most often, with held, wobbled and missed counts, linking to the Library item or the job; and suggestions per analyzer as accepted as proposed, accepted after an edit, rejected and pending. The first of those over the three decided columns is the hit rate the owner tunes the prompt against.

Display: five tiles (Jobs, Applied, Interviews, Offers, Response rate) and four bar lists (reached per kind with conversions, median days per kind, applications per week, response rate by source), then the tables. Bars are plain elements in one hue (`bg-chart-1` on `chart-grid` tracks), sized through a CSS variable with `w-[var(--share)]` so `pnpm check:tokens` passes, with the number printed on every bar and no legend. Each chart is `aria-hidden` beside its table twin, a `table-view` holding the same numbers, visually hidden by default and shown by a "Table" toggle. At phone width tables become two-line rows, the close table becomes one line per kind ("Recruiter screen: 4 rejected, 2 ghosted") and the weekly list shows the last 12 weeks, so the page never scrolls sideways. The loader selects ids, kinds, dates, reasons and sources only, never posting or body text, and the integration suite holds it under 200 ms for 1,000 jobs. Decision: no chart library. Reason: four single-series bar lists and some tables; plain elements stay token-checked, print their own numbers and need no SVG accessibility layer, and shadcn's `chart` primitive would add a charting dependency nothing else uses. Cost if wrong: swapping in the primitive touches `components/funnel/` only, and `docs/design-system.md` records the choice under "New application code".

### 5.11 Bridge, CLI and export

The context document (`lib/bridge/context.ts`) gains `## Debriefs` after Prep's sections: per debriefed stage, newest first, `### Recruiter screen, 3 Nov 2026 (4 of 5)`, then one line per applied ask ("Q12 missed: How do you decide what not to build?"), per question added to a bank ("Added to questions-recruiter-screen as 31"), per follow-up, and "3 suggestions waiting for review". It carries no transcript text and no quotes; a skill that needs them pulls the document with `jobsmith pull --doc` (Apply 5.5). One instruction line says: "Questions from debriefs sit under `## Asked on` headings in the bank; pull the bank before rewriting it." The frontmatter stays `context/v1`.

Request kind for cycle 7. Bridge part two (`docs/superpowers/specs/2026-11-01-jobsmith-bridge-two-design.md`) leaves a Debrief slot in its section 5.4, and this spec fills it with an eighth kind, `debrief`, added to `lib/requests/kinds.ts` by whichever of the two plans comes second: params `key` (the debrief document) and `note`; stage-bound like Bridge's other stage kinds; dedupe key the document key; expected output that key, kind `debrief`, job scope, on the stage; bundle the debrief's latest version under `input/` and the latest version of each question bank on the job; in-app task `debrief_suggest`; 20 minutes, files only. Its instructions in `request.md` ask for the same document rewritten in the debrief grammar (5.2), with `## Transcript` kept as it is, a quote copied from the transcript inside each `**Why:**`, and ISO dates. The push fulfills the request under Bridge's rule (any new version of the key), and ingest turns it into `parser` suggestions at no credit cost. Once that ships, "Get suggestions" opens Bridge's Where dialog (Bridge 5.9: a runner, "Later, from Claude Code", or In Jobsmith at 5 credits). Until then it runs in the app, and the owner can run his own skill on the file and push the result by hand.

The CLI adds `jobsmith transcribe` (5.3). Export is as listed in section 4.

## 6. Error handling

- Ingest never fails a push or a save. Grammar problems (an unknown `**Went:**` value, a date that does not parse, a heading with no items) are warnings on the review page, and a debrief with no grammar content gets the offers in 5.4.
- Transcription: an oversize, over-long, video or unreadable file stops at upload with the limit named; `stt_timeout`, `stt_bad_audio`, `stt_rate_limited` and `stt_error` set `failed`, refund and keep the audio for 24 hours; a missing object at finish is `upload_missing`; a size or hash mismatch deletes the object and asks for the upload again. With transcription off, the recording option says so and names the CLI path.
- Model run: Hosted's codes (`ai_timeout`, `ai_bad_output`, `ai_error`, `gen_stalled`) refund and keep the parser's suggestions; refusals before the reservation (`ai_off`, `no_credits`, `cap_task_day`, `cap_global`, `busy`) charge nothing.
- Apply: a closed job skips moves, a gone target skips its row, a stale preview merges (5.8), and any unexpected error rolls the whole transaction back with every row as it was.
- Funnel: an empty cohort shows the empty state with the window toggle; a job with no `entered_at` counts from `created_at`.
- Logs: `[debrief]` lines with the debrief id, counts per kind, analyzer and codes; `[stt]` lines with ids, provider, model, bytes, audio milliseconds, run milliseconds and code. Never transcript text, quotes, file names or people's names.

## 7. Security and privacy

- The three tables are owned, reached through the scoped helper and in the isolation test; the upload route checks its single-use token, and the debrief pages and actions check the session.
- Recordings: an attestation on every upload, private objects under the user's prefix (Hosted 5.10) with random keys and no public URL, deletion when the transcript saves, after 30 days at most when kept, and after 24 hours for an abandoned upload. Audio goes only to the configured transcription provider. The app records nothing itself, joins no meeting and imports from no link, and it builds no voiceprint or speaker identity.
- Transcripts hold other people's words. They stay in the user's account, reach a model only when the user presses "Get suggestions", stay out of the bridge context and the logs, and go with "Delete this debrief" (5.1). The privacy page's processor table (Hosted 5.9) gains the transcription provider, and the data map gains rows for recordings (storage, the transcription provider, kept until the transcript saves) and transcripts (Postgres, the AI provider on request, kept until deletion).
- Prompt injection: notes and transcript sit in tags behind the data wrapper, model output only becomes suggestions a person reviews, quotes and ids are checked in code, and nothing in a suggestion is fetched or rendered as HTML; the review renders text nodes and the sanitized renderer only.
- Admin (Hosted 5.11) gains counts of suggestions by status and analyzer; its column test adds `payload`, `edited_payload`, `quote` and `asked_text` to the forbidden list.
- New outbound calls go to `TRANSCRIBE_BASE_URL` from operator config, or to the endpoint the user names on the CLI; no URL comes from user content, and the fetch guard stays the only path to a user-supplied address.

## 8. Testing

Test-driven for everything under `lib/`, as in Core.

- **Unit:** the grammar as a table of cases (every heading and synonym, both question forms, date forms, rating forms, unknown values); the form round trip; cleanup and each truncation step on fictional transcripts; matching thresholds and stop words; the mark table; fingerprints; sanitize (caps, ids, dates, quotes found and missing); the prompt snapshot; the bank section (numbering, marker, joining an existing section, the default bank); next action composition and its 300-character cut; sniffing and the M4A duration on tiny fixtures; Drill's first tier with a fixed clock; the Home additions; every funnel function on a fixture search with skipped stages, a reopened job, imported dates and a week that crosses a time zone change; the "CV recorded as sent" split resolving each `document_sent` event's kind through the (`opportunity_id`, `key`, `version`) join, including an event with Apply's extra meta fields and one whose key names a cover letter.
- **Integration (PGlite with the real migrations):** isolation for the three tables and the upload route; ingest on push, paste, form and in-place edit; supersede and fingerprint dedupe across two debriefs; Apply across every kind in one transaction (the bank fork with Prep's reparse keeping marks, the library item, the next action, the appended notes, a move) and a second Apply writing nothing; a re-push of the old bank text reporting `unchanged`, and a changed push carrying the notice and the section forward; the transcription lifecycle with the fake driver and `memory` storage, the object gone after success, kept after failure and removed by the expiry step; reservation and refund under `dbMeter`; deleting a debrief; the export additions; the funnel loader at 1,000 jobs; `jobsmith transcribe` against a fake OpenAI-compatible server.
- **End to end (Playwright, Chromium and WebKit, desktop and phone):** a quick-form debrief from Home's rule 5 item, Apply, then the hub chip, a Drill opening on the missed question and Home's missed line; a pasted fictional transcript with the fake AI driver, one Edit, one Reject, Apply; an upload through the fake transcriber with its notice and attestation; the funnel on the seed at both widths with the window and table toggles. A `debrief-*` project chain runs after the earlier chains, one engine at a time.
- **Accessibility:** axe on the entry, review and funnel routes in light and dark; keyboard-only review with `a`, `e` and `r`; the table twins read in order; live regions for "Suggestions ready" and "Applied 6 changes".
- **Live, opt-in:** one model run on a fictional transcript and one transcription of a synthetic recording when the keys are present, as Core's live smoke test.

## 9. Milestones

Numbering continues from Apply and Research. Milestone 25 needs Prep's rows and marks (Milestone 6) and the Library (Milestone 9), and the carry-forward of an "Asked on" section needs Apply's Milestones 20 and 22; Milestones 27 and 28 need Hosted's generation and credits (Milestones 13 and 14), and 28 needs Prep's storage (Milestone 7). A milestone whose dependency has not shipped leaves that piece out and says so in its plan.

| # | Name | Scope | Done when |
|---|---|---|---|
| 25 | Debrief in | migration for the three tables and the event kind; the grammar and the quick form; paste with the file picker; the entry route; ingest on every version; matching, the mark table and fingerprints; the review page; Apply through every owner, the `fork` intent and `appendStageOutcome`; the `debrief_applied` event; the Debriefs block; delete; export | A quick-form debrief of a fictional recruiter screen with one held, one missed and one new question, a follow-up and "next round" shows its suggestions; Apply changes both marks, adds a bank version whose new question is an unfilled row under "Asked on", sets the next action, appends the stage notes and moves the job; pushing the same debrief as a file afterwards proposes nothing |
| 26 | Prep loop | `lib/prep/asked.ts` reads, hub chips and "Asked at N other companies", Drill's first tier and `?missed=1`, Home's missed line, `debrief_review` and the rule 5 change, Library history, the context document's Debriefs section, the carry offer on the Prep tab | After the Milestone 25 debrief, the hub shows the chip, the next Drill opens on the missed question, Home's next interview item says "1 question missed last round", and one drill of that question removes the line |
| 27 | Suggestions | `debrief_suggest` in `lib/generate`, the prompt, schema, cleanup and truncation, sanitize and the quote check, price and cap, `debrief_ready`, Analyze again, the hit-rate counts | A pasted fictional 50-minute transcript gets suggestions with verified quotes from the fake driver in CI and from the real model on the preview, a 120-minute fixture says how much was analyzed, a failed run refunds, and with AI off the page offers the quick form |
| 28 | Recordings | `lib/transcribe` with its drivers, `createUpload` and `head` in the storage drivers, the upload route, the asset kind and `expires_at`, sniffing and duration, the notice and attestation, `transcribe_audio` with its price, deletion after the transcript, the tick step, `jobsmith transcribe` | A synthetic recording uploads on desktop and phone and transcribes through the fake driver in CI and, through the CLI, the owner's local whisper server; the stored object is gone once the transcript saves; a 30 MB file is refused before upload; an abandoned upload is gone after a day |
| 29 | Funnel | `profile.search_started_on`, `lib/funnel`, `/funnel` with tiles, bar lists, tables and twins, the three windows, the phone layout, the navigation entry | On the seed, counts, conversions, medians and the response rate match a hand-computed fixture, the window toggle changes them, axe passes in light and dark, and nothing scrolls sideways at 390 px |

Each milestone ends with a preview link, a pass in Chrome and Safari and the test suites green.

## 10. Port sources and licensing

| Source | What Debrief takes | Where |
|---|---|---|
| The owner's per-round debrief documents in his prep folder (private) | the shape only: questions asked with how each went, what landed, what did not, follow-ups, next steps. No content, names or wording is copied; every fixture is fictional | `lib/debrief/grammar.ts`, `tests/fixtures/debrief/` |
| InterviewPreparationsBot grammar, through Prep's parser | the `### N.` heading rule, the warning marker and `question_key` normalization, reused as Prep defines them | `lib/debrief/grammar.ts`, `lib/prep/bank-append.ts` |
| Prep `lib/audio/duration.ts` and `lib/storage`, Hosted `lib/generate` and `lib/credits`, Apply `lib/compare/merge`, Feed `lib/notify` | reused as their specs define them, with the additions listed in section 4 | 5.3, 5.5, 5.8 |

Nothing comes from the MIT-licensed upstream career-ops project. New dependency: `@aws-sdk/s3-presigned-post` (Apache-2.0) for the `s3` upload target; `@vercel/blob`, already added by Prep, ships the client upload helper. Similarity, sniffing, the M4A reader, truncation and the bars are new code under AGPL-3.0. Design system: Core's order of preference holds. The review and the funnel use the registry's `detail-view-shell`, `section-header`, `field-row`, `empty-state` and `table-view`; the form uses the installed `base-nova` `radio-group`, `combobox`, `toggle-group`, `textarea`, `dialog` and `sheet`. The suggestion row, the apply bar, the bar list, the table twin toggle and the upload field are new code, each recorded in `docs/design-system.md` under "New application code" with its reason.

## 11. Assumed until the owner says otherwise

1. The debrief grammar in 5.2, and that the owner's debrief skill can write those headings.
2. The mark table: held raises one step and never reaches solid from unmarked; missed sets shaky.
3. Asks live in `asked_question`; `prep_mark` stays as Prep defines it.
4. Accepted follow-ups merge into the job's one next action, at 09:00 on the earliest due day, with no follow-up list.
5. New questions go to the next stage's bank by default, as a forked edited version under "Asked on <date>, add to the bank"; questions with no answer carry the unfilled marker.
6. Suggestions run on `AI_MODEL` (Haiku 4.5) at 5 credits with a cap of 10 a day; the writing model would cost about 10.
7. Transcription costs 1 credit per 2 started minutes, capped at 240 minutes a day; uploads are at most 25 MB (about 50 minutes at 64 kbps), 120 minutes and 10 a day.
8. Transcripts are cut at 80,000 characters and notes at 8,000, dropping long interviewer turns first and the end last.
9. Audio is deleted when the transcript saves, kept 30 days only when the user asks, and deleted after 24 hours when abandoned.
10. The attestation is a checkbox on every upload, and the notice wording is settled in the Milestone 28 plan with the owner.
11. The CLI's default transcription endpoint is `http://127.0.0.1:8000/v1`, overridden by `JOBSMITH_STT_URL` or `--stt-url`.
12. The funnel's cohort is by job start date; the default window is this search when set, else 90 days; percentages need a denominator of 10; an application with no event for 30 days counts as no response.
13. Match thresholds are 0.75 and 0.45 over an English stop-word list, and matching covers the job and the Library only.
14. A debrief is the only artifact kind that can be deleted, with all its versions.
15. A transcript made on the server is stored with origin `generated` (the app made the text), and one pushed by `jobsmith transcribe` with origin `pushed`; typed and pasted debriefs keep `manual` and `pasted`.
16. Milestone order: the no-model path and the Prep loop first, because the owner's debriefs already exist as files; recordings after the model run; the funnel last, since it depends on nothing and can move earlier.

## 12. After Debrief

The cycle table in Core section 12 stands. Debrief moves these out:

| Item | Where it goes |
|---|---|
| Reviewing a kept Drill recording against its Say block (handed by Prep) | a follow-up milestone after 29: `lib/transcribe` plus a word-coverage score in code |
| Rewriting an existing bank question in place (handed by Hosted) | cycle 7, as a skill request that rewrites the bank. That in-place editing path would replace this cycle's Library answer and its "Answer in Library" chip (5.7) |
| Running a debrief skill on the user's computer from the app | cycle 7, as the `debrief` request kind defined in 5.11 |
| Drafting the thank-you note from a follow-up | a Hosted task after the beta (`message_draft`, key `thank-you-<stage slug>`), one entry in `lib/generate/tasks/` |
| Follow-up reminders on Telegram or email | a later Feed revision; the notification kind exists |
| A follow-up list beyond the one next action | when the owner asks; accepted rows seed it |
| Speaker labels from the transcription provider | when a configured provider returns them; `Name:` lines already read as labels |
| Funnel benchmarks across users | not planned |
| Recording inside the app, meeting bots, live transcription | not planned |
