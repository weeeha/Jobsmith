# Milestone 8: Drill

> Done when: "After one drill run, the next run starts with the questions marked shaky" (spec section 9).

Branch: `feat/m08-drill`, cut from `main` after Milestone 7 has merged. Tasks 32 to 37.

**Before starting.** Milestone 7 must be merged:

```bash
test -f components/player/speaker.ts && test -f components/player/engine.ts && test -f lib/prep/plan.ts \
  && test -f lib/prep/player-data.ts && test -f lib/audio/segments.ts && test -f lib/prep/sessions.ts \
  && test -f components/prep/mark-buttons.tsx && echo m7-ok
```

If a file is missing, stop. The spec's note that Drill in text mode could ship after Milestone 6 is not split out in this plan: Drill reuses the speaker, the plan builder and the segment lookup. Read `node_modules/next/dist/docs/` on route handlers with multipart bodies before Task 36.

---

### Task 32: Drill gap and ordering

**Files:**
- Create: `lib/prep/gaps.ts`, `lib/prep/order.ts`
- Test: `tests/unit/prep-gaps.test.ts`, `tests/unit/prep-order.test.ts`

**Interfaces:**
- Consumes: `IDEAL_CPS` (Task 17), `MarkLevel`, `toSpokenText`, `ParsedBlock`.
- Produces:

```ts
export const MORE_TIME_SECONDS = 30;
export function drillGapSeconds(sayChars: number, gapFactor: number): number;       // clamp(round(sayChars / 13 * 1.2), 15, 120) * gapFactor
export function sayLength(blocks: ParsedBlock[]): number;                           // spoken length of the Say block, else of the first spoken block, else 0
export type DrillCandidate = { questionKey: string; position: number; section: string | null; hasAnswer: boolean; level: MarkLevel | null; lastDrilledAt: Date | null };
export function orderForDrill<T extends DrillCandidate>(candidates: T[], options: { count?: number; section?: string; onlyShaky?: boolean }): T[];
```

`orderForDrill` rules (spec 5.4): keep candidates with an answer; with `section` keep that section only and ignore `count`; with `onlyShaky` keep level `shaky` only; sort by level (shaky, okay, unmarked, solid), then `lastDrilledAt` oldest first with never-drilled first, then `position`; never repeat a question key (the first by sort order wins); take `count` (default `DRILL_DEFAULT_COUNT`, 10) unless a section is given.

- [ ] **Step 1: Write the failing tests**

```ts
// prep-gaps.test.ts
it("0 characters gives the 15 second floor");
it("130 characters gives round(12) = 12, clamped up to 15");
it("195 characters gives 18 seconds");
it("1000 characters gives 92 seconds");
it("2000 characters gives the 120 second ceiling");
it("the gap factor multiplies after the clamp: 15 x 0.5 = 7.5 and 120 x 2 = 240");
it("sayLength uses the Say block, falls back to the first spoken block and returns 0 for none");
it("sayLength measures the spoken text, not the markdown");
it("MORE_TIME_SECONDS is 30");
// prep-order.test.ts (fixed timestamps)
it("orders shaky, then okay, then unmarked, then solid");
it("inside a level, never-drilled comes first, then the oldest lastDrilledAt, then position");
it("drops questions with no answer");
it("never repeats a question key that appears twice in a bank");
it("takes ten by default and the given count otherwise");
it("a section drill returns every answered question of that section and ignores count");
it("onlyShaky keeps just the shaky ones");
it("is stable: the same input gives the same order");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/prep-gaps.test.ts tests/unit/prep-order.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement both modules**

Pure functions. `drillGapSeconds` does not round the final product, so a factor of 0.5 gives 7.5 (the timer shows whole seconds by rounding up at display).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/prep-gaps.test.ts tests/unit/prep-order.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prep/gaps.ts lib/prep/order.ts tests/unit/prep-gaps.test.ts tests/unit/prep-order.test.ts
git commit -m "feat(prep): drill gap formula and ordering"
```

**Acceptance:** (1) The gap is `clamp(round(sayChars / 13 x 1.2), 15, 120) x gapFactor` (spec 5.4). (2) The order is level, then oldest drilled with never-drilled first, then position, with no repeats (spec 5.4).

---

### Task 33: Drill data and summary

**Files:**
- Create: `lib/prep/drill.ts`
- Modify: `lib/prep/player-data.ts` (a `loadDrillData` next to `loadPlayerData`)
- Test: `tests/integration/prep-drill.test.ts`

**Interfaces:**
- Consumes: `orderForDrill`, `drillGapSeconds`, `sayLength` (Task 32), the question rows and marks, `spokenSteps`, `segmentHash`, `lookupSegments`, `getPrepSettings`, `resolveVoices`, `ttsIdentity`.
- Produces:

```ts
export type DrillQuestion = {
  questionKey: string; number: number; section: string | null; question: string;
  ask: PlaybackStep;                 // the interviewer reading the question
  say: PlaybackStep[];               // the candidate reading the Say block (or the first spoken block)
  spine: string | null; lastLine: string | null; guard: string | null; sayText: string;
  gapSeconds: number;                // drillGapSeconds(sayLength, settings.gapFactor)
  level: MarkLevel | null;
};
export type DrillData = { questions: DrillQuestion[]; settings: PrepSettings; sessionMeta: { order: string[]; docKey: string | null; section: string | null; onlyShaky: boolean } };
export async function loadDrillData(s: Scoped, input: { opportunityId: string; docKey: string | null; section: string | null; count: number | null; onlyShaky: boolean }): Promise<Result<DrillData, "not_found" | "empty">>;
export type DrillSummary = { marks: { questionKey: string; question: string; level: MarkLevel }[]; skipped: number; stillShaky: { questionKey: string; question: string }[]; solid: number };
export function summarizeDrill(questions: { questionKey: string; question: string; level: MarkLevel | null }[], given: Record<string, MarkLevel>, skipped: string[]): DrillSummary;
```

"Still shaky" means questions of the session whose level after the session is `shaky`, from a mark given now or a standing one that was skipped.

- [ ] **Step 1: Write the failing tests**

```ts
it("loadDrillData orders questions shaky first and fixes the order in sessionMeta.order");
it("after a question is marked shaky through markQuestion with drilled true, the next loadDrillData starts with it");   // the done-when sentence at the library level
it("a question marked solid comes last");
it("docKey limits the session to one bank; no docKey uses every bank of the job");
it("section limits to that section and ignores count");
it("onlyShaky returns just the shaky questions and empty when there are none");
it("a job with no answered question is empty");
it("each question carries ask and say steps with clips attached when segments are done and browser steps otherwise");
it("gapSeconds uses the Say length and the saved gap factor");
it("another user's job is not_found");
it("summarizeDrill lists marks given, counts solid and skipped and returns the questions still shaky");
it("a skipped question that was already shaky stays in stillShaky");
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/prep-drill.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `loadDrillData` and `summarizeDrill`**

Build candidates from `s.prepQuestion.listForJob` and `s.prepMark.listForJob` (job scope), run `orderForDrill`, then map each chosen row to a `DrillQuestion` using `spokenSteps` for the ask step and the Say block's candidate step. Step hashes and clips come from the same `resolveClip` used by `loadPlayerData` (extract that function from Task 29's code into `lib/prep/player-data.ts` as `makeClipResolver(s, identity, voices)` and use it in both).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/prep-drill.test.ts tests/integration/prep-player-data.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prep/drill.ts lib/prep/player-data.ts tests/integration/prep-drill.test.ts
git commit -m "feat(prep): drill data with fixed order and the session summary"
```

**Acceptance:** (1) The order is fixed when the session starts and reads standing marks, so after one run the next starts with the shaky questions (spec 5.4, 9). (2) "Drill the shaky ones again" has a data source: `onlyShaky` (spec 5.4). (3) Each question carries the steps Drill plays.

---

### Task 34: Drill state machine

**Files:**
- Create: `lib/prep/drill-state.ts`
- Test: `tests/unit/prep-drill-state.test.ts`

**Interfaces:**
- Consumes: `MORE_TIME_SECONDS` (Task 32), `MarkLevel`.
- Produces:

```ts
export type DrillPhase = "ask" | "gap" | "reveal" | "summary";
export type DrillState = { index: number; phase: DrillPhase; remaining: number; given: Record<string, MarkLevel>; skipped: string[]; extraSeconds: number };
export type DrillEvent =
  | { type: "asked" }                                 // the interviewer finished: start the gap
  | { type: "tick" }                                  // one second
  | { type: "done" }                                  // the user ends the gap early
  | { type: "more_time" }                             // adds 30 seconds, gap only
  | { type: "mark"; level: MarkLevel }                // marks and advances
  | { type: "skip" };                                 // advances with no mark
export function initialDrillState(): DrillState;
export function drillReducer(state: DrillState, event: DrillEvent, questions: { questionKey: string; gapSeconds: number }[]): DrillState;
export function keyToLevel(key: string): MarkLevel | null;      // "1" shaky, "2" okay, "3" solid
```

- [ ] **Step 1: Write the failing tests**

```ts
it("starts in ask on the first question");
it("asked moves to gap with remaining equal to the question's gapSeconds rounded up");
it("tick counts down one second and reaching zero moves to reveal");
it("done moves from gap to reveal at once");
it("more_time adds 30 seconds in gap and is ignored in other phases");
it("mark in reveal records the level, advances to the next question's ask and keeps the question order");
it("mark on the last question moves to summary");
it("skip advances without recording a mark and lists the question as skipped");
it("a question is never asked twice in one session");
it("mark and skip are ignored in ask and gap: the answer is revealed first");
it("keyToLevel maps '1', '2' and '3' and nothing else");
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/prep-drill-state.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the reducer**

Pure. A mark outside `reveal` is ignored on purpose: the loop is ask, gap, reveal, mark (spec 5.4). `extraSeconds` totals the added time so the summary can mention it if the design wants it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/prep-drill-state.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prep/drill-state.ts tests/unit/prep-drill-state.test.ts
git commit -m "feat(prep): drill state machine"
```

**Acceptance:** (1) The loop is ask, silent gap with countdown, reveal, mark, with "Done" and "More time" (+30 seconds) (spec 5.4). (2) Keys 1 to 3 map to Shaky, Okay, Solid (spec 5.4). (3) Marking advances; Skip advances with no mark (spec 5.4).

---

### Task 35: Drill screen and summary

**Files:**
- Create: `app/(app)/jobs/[slug]/drill/page.tsx`, `components/player/drill-player.tsx`, `components/player/drill-timer.tsx`, `components/player/drill-summary.tsx`
- Modify: `components/prep/bank-card.tsx` (Drill button), `components/prep/question-list.tsx` (a "Drill this section" link on each section heading), `docs/design-system.md`
- Test: `tests/unit/drill-player.test.tsx`, `tests/unit/drill-timer.test.tsx`, `tests/unit/drill-summary.test.tsx`

**Interfaces:**
- Consumes: `loadDrillData`, `summarizeDrill` (Task 33), `drillReducer`, `keyToLevel` (Task 34), `useSpeaker` (Task 28), `markQuestionAction`, `startSessionAction`, `endSessionAction` (Task 9), `MarkButtons`, `PREP_COPY`.
- Produces: the route `/jobs/[slug]/drill?doc=<ref>&section=<name>&n=<count>&only=shaky`; `<DrillPlayer data sessionMeta slug>`; `<DrillTimer remaining>`; `<DrillSummary summary slug docRef>`.

Screen behaviour (spec 5.4): on mount call `startSessionAction({ opportunityId, mode: "drill", questions, meta: sessionMeta })` once; the interviewer asks (clip or browser voice) with the question text hidden until asked, then shown; a silent gap with a visible countdown (`role="timer"`, polite announcements only at 30 and 10 seconds left); "Done" and "More time" buttons; the reveal shows the Spine first, then plays the Say block in the candidate voice with its transcript, with Last line and Guard shown as notes; three large mark buttons Shaky, Okay, Solid (also keys 1 to 3), a "Skip" button; every mark calls `markQuestionAction` with `drilled: true`. Space ends the gap early or replays the Say block; Right arrow skips. The summary shows the marks given, the questions still shaky, a "Drill the shaky ones again" link to `?only=shaky` and calls `endSessionAction` once with `{ seen, marked, solid }`. The `prep_drilled` event comes from the end call.

- [ ] **Step 1: Write the failing tests**

```tsx
// jsdom, fake timers, speaker stubbed
it("hides the question until the interviewer has asked, then shows it");
it("the gap shows a countdown with role timer that ticks each second and moves to the reveal at zero");
it("Done ends the gap early and More time adds 30 seconds");
it("the reveal shows the Spine first and the Say transcript with Last line and Guard as notes, and plays the Say block");
it("tapping Solid calls markQuestionAction with drilled true and moves to the next question");
it("keys 1, 2 and 3 mark Shaky, Okay and Solid in the reveal and do nothing before it");
it("Skip advances with no call to markQuestionAction");
it("space ends the gap, and in the reveal replays the Say block");
it("startSessionAction is called once on mount with mode drill and the fixed order");
it("the summary lists the marks given and the questions still shaky and links 'Drill the shaky ones again' to ?only=shaky");
it("endSessionAction is called once, with seen, marked and solid counts");
it("announces marks through the live region");
it("a question with no clip still plays through the browser voice");
it("an empty drill shows the empty state instead of the player");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/drill-player.test.tsx tests/unit/drill-timer.test.tsx tests/unit/drill-summary.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the page and components**

The page validates `doc` with `parseDocRef`, `section` as a short string, `n` as an integer from 1 to 50 and `only` as the literal `shaky`; it calls `requireUser()` and `loadDrillData`. The player drives `drillReducer` with a one-second interval and the speaker. If `startSessionAction` fails (offline), the drill still runs and the end call is skipped. Large targets, visible focus and the three mark buttons reuse `MarkButtons` styling at a larger size. Run the unslop render tier at 375 and 1280 pixels, light and dark.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/drill-player.test.tsx tests/unit/drill-timer.test.tsx tests/unit/drill-summary.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/jobs/[slug]/drill" components docs/design-system.md tests/unit
git commit -m "feat(prep): Drill screen with timer, reveal, marks and summary"
```

**Acceptance:** (1) Every step of the loop in spec 5.4 is on screen, with keyboard marks and large targets. (2) The session ends with a summary, "Drill the shaky ones again" and a `prep_drilled` event (spec 5.4). (3) Each mark increments `drill_count` and sets `last_drilled_at` (spec 5.4).

---

### Task 36: Record my answer (optional, the first cut)

**Files:**
- Create: `lib/audio/recordings.ts`, `app/api/assets/route.ts`, `components/player/record-answer.tsx`, `components/prep/question-recordings.tsx`
- Modify: `components/player/drill-player.tsx` (the record control), `lib/prep/hub.ts` (each `HubQuestion` gains `recordings: { assetId: string; createdAt: string }[]`), `components/prep/question-list.tsx`, `lib/prep/copy.ts` (proposed copy), `docs/design-system.md`
- Test: `tests/integration/audio-recordings.test.ts`, `tests/unit/record-answer.test.tsx`

**Blocked on:** a real device microphone for the live check. The tests stub `navigator.mediaDevices.getUserMedia` and `MediaRecorder`. If Milestone 8 runs long, this task is the first cut and Task 37 skips its record steps (spec 5.4).

**Interfaces:**
- Consumes: `newRecordingKey`, `Storage`, the scoped `asset` and `prepSession` helpers, `requireUser`, `getStorage`, `RECORDING_MAX_BYTES = 8_388_608` (plan constant).
- Produces: `lib/audio/recordings.ts` writes assets of kind `recording`, the one writer of that kind, separate from `lib/audio/segments.ts`:

```ts
export async function storeRecording(s: Scoped, deps: { storage: Storage; randomHex(bytes: number): string }, input: { opportunityId: string; sessionId: string; questionKey: string; contentType: string; bytes: Uint8Array; now?: Date }): Promise<Result<{ assetId: string }, "not_found" | "invalid" | "too_large">>;
export async function listRecordings(s: Scoped, opportunityId: string, questionKey: string): Promise<{ assetId: string; createdAt: Date }[]>;
export async function deleteRecording(s: Scoped, deps: { storage: Storage }, assetId: string): Promise<Result<null, "not_found">>;
// POST /api/assets (multipart: file, opportunityId, sessionId, questionKey) => 201 { assetId }; 413 over 8 MB; 400 for a type other than audio/webm, audio/mp4, audio/ogg
// the link to the question lives in prep_session.meta.recordings: [{ questionKey, assetId, createdAt }], because the asset table has no question column
```

- [ ] **Step 1: Write the failing tests**

```ts
// audio-recordings.test.ts (PGlite, memory storage)
it("storeRecording writes an object under u/<hash>/rec/<random>.webm, an asset of kind recording attached to the job, and a meta entry on the session");
it("rejects a content type other than audio/webm, audio/mp4 and audio/ogg, and a body over 8 MB");
it("another user's job or session is not_found and nothing is stored");
it("listRecordings returns a question's recordings across the job's sessions, newest first");
it("deleteRecording removes the object, the asset row and the meta entry");
it("the asset route serves a recording to its owner and 404 to another user");   // reuses serveAsset
// record-answer.test.tsx (jsdom, stubbed media)
it("the button 'Record my answer' starts recording on a click and stops at the reveal");
it("after the reveal it plays the recording next to the Say clip and offers Keep and Discard");
it("nothing is uploaded until Keep is tapped; Discard drops the blob");
it("a refused microphone hides the button for the session with 'Recording is not available: the microphone was refused.'");
it("hides the button when MediaRecorder is missing");
it("the hub lists recordings under their question with a Delete button");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/audio-recordings.test.ts tests/unit/record-answer.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the module, the route and the components**

The route reads the multipart body with a byte cap (`Content-Length` check plus a counted stream read, as `readJsonCapped` does) and calls `requireUser()`. Microphone access starts only on a click (spec 7). The `meta.recordings` link is a plan decision the owner can replace with an `asset.question_key` column later (README, owner answer for Milestone 8). The extension comes from the content type: `webm`, `mp4`, `ogg`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/audio-recordings.test.ts tests/unit/record-answer.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS. Live: on a phone, record, keep, play back, delete; record the result in the task report.

- [ ] **Step 5: Commit**

```bash
git add lib/audio/recordings.ts "app/api/assets/route.ts" components lib/prep docs/design-system.md tests
git commit -m "feat(prep): optional Record my answer in Drill"
```

**Acceptance:** (1) The microphone is requested on a user gesture and nothing leaves the device until "Keep" (spec 5.4, 7). (2) Kept recordings are `recording` assets attached to the job, listed under the question and deletable one by one (spec 5.4). (3) A refused permission hides the control with a one-line reason (spec 6).

---

### Task 37: End to end, docs and ship

**Files:**
- Create: `tests/e2e/prep-drill.spec.ts`, `tests/e2e/stub-media.ts` (an init script stubbing `getUserMedia` and `MediaRecorder`)
- Modify: `README.md` (a Drill paragraph: the loop, keys, "Drill the shaky ones again"), `docs/design-system.md`
- Test: the spec above

**Interfaces:**
- Consumes: Task 14 and Task 31 helpers, `page.clock` for the countdown.
- Produces: the Milestone 8 end to end proof.

- [ ] **Step 1: Write the failing e2e spec**

```ts
test("after one drill run, the next run starts with the questions marked shaky", ...);
//   push the Northwind fixture; Drill; for each of three questions ask, Done, mark (first Solid, second Shaky, third Okay);
//   summary lists the marks and 'Drill the shaky ones again'; start a new Drill: the first question is the shaky one
test("Drill the shaky ones again starts a session of only the shaky questions", ...);
test("keyboard only: space ends the gap, 1 to 3 mark, right arrow skips", ...);
test("More time adds thirty seconds and the countdown fast-forwards with the clock", ...);   // page.clock.install, fastForward
test("the timeline shows 'Drilled 3 questions, 1 marked solid' after the session ends", ...);
test("marks from Drill show on the hub's confidence summary and on Home's interview item", ...);
test("Record my answer: keep one recording, see it under the question on the hub, delete it", ...);   // stubbed media; skipped when Task 36 was cut
test("Drill and its summary pass axe in light and dark on every project", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e --project=prep-chromium`
Expected: FAIL until Tasks 32 to 36 are in, then PASS.

- [ ] **Step 3: Write the docs**

Add the Drill paragraph to `README.md` and the new components to `docs/design-system.md` ("New application code": drill timer, drill player, summary, record control, with reasons).

- [ ] **Step 4: Run the full suite and the preview check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit and the phone project. Deploy the preview, run one drill with real clips on desktop Chrome and Safari and at 390 px, then a second drill and confirm it opens on the shaky question. Report the preview URL.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e README.md docs/design-system.md
git commit -m "test(prep): Milestone 8 end to end, docs and ship"
```

**Acceptance:** (1) The done-when sentence passes on every project (spec 9). (2) Drill and its summary have zero axe violations in light and dark and work keyboard-only (spec 8). (3) The session ends with a `prep_drilled` timeline event (spec 4).
