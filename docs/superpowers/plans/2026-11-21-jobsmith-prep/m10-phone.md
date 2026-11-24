# Milestone 10: Phone

> Done when: "On an installed phone app in airplane mode, a saved job's bank plays, and a mark made offline shows on the desktop after reconnecting" (spec section 9).

Branch: `feat/m10-phone`, cut from `main` after Milestone 9 has merged. Tasks 47 to 54.

**Before starting.** Milestones 6 to 9 must be merged:

```bash
test -f "app/(app)/jobs/[slug]/listen/page.tsx" && test -f "app/(app)/jobs/[slug]/drill/page.tsx" \
  && test -f "app/(app)/jobs/[slug]/quick-fire/page.tsx" && test -f "app/api/assets/[id]/route.ts" \
  && test -f lib/prep/player-data.ts && test -f components/prep/mark-buttons.tsx \
  && test -f lib/storage/keys.ts && test -f "app/(app)/library/[id]/page.tsx" && echo m6-9-ok
```

The Library is not cached offline (spec 5.9: only saved jobs). Without Milestone 8, leave out the Drill row of Task 50. Read the Next.js guide on progressive web apps and service workers in `node_modules/next/dist/docs/` before Tasks 47 and 48 and copy the headers it lists for `sw.js`; this Next.js version has breaking changes (AGENTS.md).

Platform facts the plan relies on, each checked by the end to end spec: a service worker needs HTTPS or localhost; Playwright's `context.setOffline` also blocks service worker network calls; Safari removes Cache Storage for a site unused for seven days unless the app is on the home screen (the install hint says so).

---

### Task 47: Manifest, theme colour and icons

**Files:**
- Create: `app/manifest.ts`, `lib/pwa/theme.ts`, `scripts/make-icons.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Modify: `app/layout.tsx` (`viewport` export with `themeColor` for light and dark, `width: "device-width"`, `initialScale: 1`; `metadata.appleWebApp` with `capable: true`, `title: "Jobsmith"`), `app/apple-icon.png` (re-rendered at 180 px by the script; check `git diff --stat`, and if the new render looks different from the existing icon keep the old file and report), `package.json` (script `"icons": "tsx scripts/make-icons.ts"`), `proxy.ts` (the matcher also excludes `manifest.webmanifest`, `sw.js`, `icons/` and `offline`, because a manifest fetch carries no cookie and a redirect to the login page would break install), `tests/unit/proxy-matcher.test.ts`
- Test: `tests/unit/pwa-manifest.test.ts`, `tests/unit/proxy-matcher.test.ts`

**Interfaces:**
- Consumes: `public/brand/mark.svg`, the semantic token values in `app/globals.css`, Playwright's `chromium` (already a dev dependency), `unstable_doesMiddlewareMatch` as in the existing matcher test.
- Produces: `THEME_COLOR_LIGHT = "#fafafa"` and `THEME_COLOR_DARK = "#0a0a0a"` in `lib/pwa/theme.ts` (the resolved values of `--surface-page` through `--base-50` and `--base-950`); the default export of `app/manifest.ts` returning `MetadataRoute.Manifest` with `name: "Jobsmith"`, `short_name: "Jobsmith"`, `start_url: "/"`, `display: "standalone"`, `background_color` and `theme_color` from `THEME_COLOR_LIGHT`, and two icons, 192 and 512 pixels, `type: "image/png"`, `purpose: "maskable"`.

- [ ] **Step 1: Write the failing tests**

```ts
// pwa-manifest.test.ts
it("the manifest has name Jobsmith, display standalone, start_url / and the theme colour");
it("it lists a 192 and a 512 pixel maskable PNG and both files exist with those dimensions (read from the PNG header)");
it("app/apple-icon.png is 180 by 180");
it("THEME_COLOR_LIGHT and THEME_COLOR_DARK equal --base-50 and --base-950 as written in app/globals.css");   // parses the css
it("layout exports a viewport with a light and a dark theme colour");
it("no manifest string contains an exclamation mark");
// proxy-matcher.test.ts (extend)
it("does not run the proxy for /manifest.webmanifest, /sw.js, /icons/icon-192.png and /offline");
it("still runs it for /swx.js, /offline-notes and /icons-list");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/pwa-manifest.test.ts tests/unit/proxy-matcher.test.ts`
Expected: FAIL, the files do not exist and the matcher still runs on those paths.

- [ ] **Step 3: Implement the manifest, the theme file, the icon script and the matcher change**

`scripts/make-icons.ts` launches Chromium through Playwright, renders an HTML page that draws `public/brand/mark.svg` centred on the light theme colour at 180, 192 and 512 pixels (the maskable icons keep the mark inside the central 80 percent safe zone) and writes the three PNGs; its outputs are committed, nothing runs at build time. The matcher entry becomes a lookahead list in the existing style, with `$` anchors so near-miss paths still match.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm icons && pnpm vitest run tests/unit/pwa-manifest.test.ts tests/unit/proxy-matcher.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS. Then `pnpm build` and fetch `/manifest.webmanifest` with no cookie: it returns 200 JSON, not a redirect.

- [ ] **Step 5: Commit**

```bash
git add app lib/pwa scripts/make-icons.ts public/icons proxy.ts package.json tests/unit
git commit -m "feat(pwa): manifest, theme colour and icons"
```

**Acceptance:** (1) A manifest with `display: standalone`, `start_url: /`, the name "Jobsmith" and maskable 192 and 512 pixel icons (spec 5.9). (2) A 180 pixel Apple touch icon from the brand mark (spec 5.9). (3) The manifest is fetchable without a session.

---

### Task 48: Service worker core

**Files:**
- Create: `public/sw.js`
- Modify: `next.config.ts` (a header entry for `/sw.js`; a `generateBuildId` that returns `process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now())` computed once and the same value exposed as `env.NEXT_PUBLIC_BUILD_ID`)
- Test: `tests/unit/sw-core.test.ts`, `tests/unit/next-config.test.ts`

**Interfaces:**
- Consumes: the Next.js service worker guide (read first) for the `sw.js` headers; `next.config.ts` `headers()`.
- Produces: `public/sw.js`, a hand-written classic script. It reads its build id from its own URL (`/sw.js?build=<id>`), so the file is versioned by the build id without a template step. It exposes its pure core through `module.exports` when `module` exists (so tests load it) and registers listeners only when `self.addEventListener` exists. Core functions:

```js
classifyRequest(url, method, mode)   // "asset" | "manifest" | "player-page" | "static" | "navigation" | "other"
normalizePageKey(url)                // /jobs/<slug>/listen keeps only ?doc; /drill keeps only ?doc; /quick-fire keeps only ?doc
shellCacheName(buildId)              // "jobsmith-shell-<buildId>"
prepCacheName(userHash, slug)        // "jobsmith-prep-<userHash>-<slug>"
isPrepCacheOf(name, userHash)        // starts with "jobsmith-prep-<userHash>-"
clearUserCaches(cachesApi, userHash) // deletes every cache of that user hash, returns the names
```

Routing, on GET requests only (spec 5.9):
- `asset` (`/api/assets/<id>`): cache-first across every `jobsmith-prep-*` cache, then network, never stored by the worker.
- `manifest` (`/api/prep/<slug>`): network-first with the prep cache as fallback.
- `player-page` (`/jobs/<slug>/listen|drill|quick-fire`): network-first, falling back to the prep cache by `normalizePageKey`; a fresh 200 refreshes an entry only when one already exists in a prep cache.
- `static` (`/_next/static/...`): cache-first in the shell cache, stored at runtime.
- `navigation` (any other document request): network; when the network fails, the precached `/offline` page from the shell cache.
- `other` (every other request, every non-GET): untouched, no `respondWith`; the worker never caches another page, the board or any other API response.
- `install` precaches `/offline` in the shell cache and calls `skipWaiting`; `activate` deletes shell caches of older build ids and calls `clients.claim`; a `message` of `{ type: "clear-user", userHash }` runs `clearUserCaches` and answers on the message port with `{ ok: true, deleted }`.

- [ ] **Step 1: Write the failing tests**

```ts
// sw-core.test.ts: load public/sw.js with createRequire after stubbing globalThis.self; fake caches (Map of Map) and fake fetch
it("classifyRequest sorts /api/assets/<id>, /api/prep/<slug>, the three player pages, /_next/static/*, a document request and everything else");
it("a POST to an asset or a page is 'other'");
it("normalizePageKey ignores q on /listen and n, section and only on /drill and keeps doc");
it("cache names are jobsmith-shell-<build> and jobsmith-prep-<userHash>-<slug>, and isPrepCacheOf matches only that user hash");
it("clearUserCaches deletes only that user's prep caches and returns their names");
it("install precaches /offline; activate deletes shell caches of other builds and keeps the current one");
it("an asset request is answered from a prep cache when present and falls to the network when not, without storing it");
it("a player page goes network-first and falls back to its cached copy when the network fails");
it("a successful player-page fetch refreshes an existing cached copy and does not create one");
it("a failed navigation to an uncached page returns the cached /offline page");
it("a request in the 'other' class is not handled: respondWith is never called");
it("the build id is read from the worker's own URL query");
it("a clear-user message deletes that user's caches and answers on the port");
// next-config.test.ts
it("/sw.js has Cache-Control no-cache and the content-security headers from the Next.js guide");
it("the /:path* rule still sets frame-ancestors 'none'");
it("generateBuildId and NEXT_PUBLIC_BUILD_ID give the same value");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/sw-core.test.ts tests/unit/next-config.test.ts`
Expected: FAIL, `public/sw.js` does not exist.

- [ ] **Step 3: Write `public/sw.js` and the config change**

Plain ES2019 so every target browser parses it, no imports. Keep the router a single `fetch` listener that calls `classifyRequest` and delegates to small named functions the tests can reach through `module.exports`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/sw-core.test.ts tests/unit/next-config.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS. Then `pnpm build && pnpm start` and `curl -sI localhost:3000/sw.js` shows `no-cache`.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js next.config.ts tests/unit/sw-core.test.ts tests/unit/next-config.test.ts
git commit -m "feat(pwa): hand-written service worker with per-job caches"
```

**Acceptance:** (1) Two cache kinds: the shell and per-job caches named `jobsmith-prep-<user hash>-<slug>` (spec 5.9). (2) Assets and the manifest answer from cache first offline, pages and the manifest network-first online, everything else network only (spec 5.9). (3) `sw.js` is served with `Cache-Control: no-cache` and `frame-ancestors 'none'` stays (spec 7). (4) A clear message deletes every cache of a user hash (spec 5.9).

---

### Task 49: Prep manifest route

**Files:**
- Create: `lib/prep/manifest.ts`, `app/api/prep/[slug]/route.ts`
- Test: `tests/integration/prep-manifest.test.ts`

**Interfaces:**
- Consumes: `loadPlayerData` (Task 29), `loadDrillData` (Task 33), the rows, marks and pitch documents of the job, `getPrepSettings`, `requireUser`, `scopedFor`.
- Produces:

```ts
export type PrepManifest = {
  version: 1; slug: string; generatedAt: string;
  job: { roleTitle: string; companyName: string };
  banks: { key: string; title: string; kind: "question_bank" | "call_card"; stageLabel: string | null; questions: { number: number; section: string | null; questionKey: string; question: string; blocks: { label: string; spoken: boolean; text: string }[]; level: MarkLevel | null; lastDrilledAt: string | null }[]; plan: PlaybackPlan }[];
  pitches: { key: string; title: string; plan: PlaybackPlan }[];
  settings: { speed: number; gapFactor: number; browserVoices: { interviewer: string | null; candidate: string | null } };
  assets: { id: string; bytes: number }[];       // every distinct clip the plans need, once
  totalBytes: number;
};
export async function buildPrepManifest(s: Scoped, slug: string, now?: Date): Promise<PrepManifest | null>;
// GET /api/prep/[slug]: 200 JSON with Cache-Control "private, no-store", 404 for an unknown or foreign slug
```

- [ ] **Step 1: Write the failing tests**

```ts
it("holds questions with blocks and marks, the playback plan per bank and pitch, and the settings");
it("lists every distinct clip once with its byte size and sums totalBytes");
it("clips that are not done are absent from assets and have clip null in the plan");
it("a slug of another user is null and the route answers 404");
it("never holds another job's questions or another user's marks");
it("the route needs a session and sets Cache-Control private, no-store");
it("a job with no banks returns empty banks and zero bytes");
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/prep-manifest.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `buildPrepManifest` and the route**

Build each bank's plan through `loadPlayerData`; collect asset ids from the steps' `clip` values and read their `bytes` with one scoped query. The route is `GET(request, ctx: RouteContext<"/api/prep/[slug]">)` with `requireUser()` first.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/prep-manifest.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prep/manifest.ts "app/api/prep" tests/integration/prep-manifest.test.ts
git commit -m "feat(prep): per-job prep manifest for offline saving"
```

**Acceptance:** (1) `GET /api/prep/[slug]` returns questions, blocks, marks and the playback plan with asset ids (spec 5.9). (2) It reports the byte total the hub shows before saving (spec 5.9). (3) A foreign slug is 404 (spec 7).

---

### Task 50: Offline client: register and save

**Files:**
- Create: `lib/offline/register.ts`, `lib/offline/save.ts`, `lib/offline/format.ts`, `lib/offline/copy.ts`
- Test: `tests/unit/offline-save.test.ts`, `tests/unit/offline-register.test.ts`, `tests/unit/offline-format.test.ts`

**Interfaces:**
- Consumes: `PrepManifest` (Task 49), `prepCacheName` from `public/sw.js` (copy the one-line naming rule into `lib/offline/names.ts` and keep a test that both agree), the Cache Storage API, `fetch` with `credentials: "include"`.
- Produces:

```ts
export function registerServiceWorker(buildId: string, deps?: { serviceWorker?: ServiceWorkerContainer }): Promise<ServiceWorkerRegistration | null>;   // registers /sw.js?build=<id> with scope "/"; null without support or in development
export type SavePlan = { pages: string[]; manifestUrl: string; assetUrls: string[]; totalBytes: number; clips: number };
export function planSave(manifest: PrepManifest): SavePlan;     // per bank: /jobs/<slug>/listen?doc=job:<key>, /drill?doc=job:<key>, /quick-fire?doc=job:<key>; per pitch: listen only; one /api/assets/<id> per clip
export function extractStaticUrls(html: string): string[];     // every /_next/static/... URL in src and href attributes
export type SaveProgress = { done: number; total: number };
export async function saveForOffline(input: { slug: string; userHash: string; fetch: typeof fetch; caches: CacheStorage; onProgress(p: SaveProgress): void; signal?: AbortSignal }): Promise<{ ok: boolean; failed: string[]; savedAt: Date }>;
export async function readSavedMeta(caches: CacheStorage, userHash: string, slug: string): Promise<{ savedAt: Date; clips: number; bytes: number } | null>;
export async function deleteSaved(caches: CacheStorage, userHash: string, slug: string): Promise<void>;
export function formatSaveSize(bytes: number, clips: number): string;      // "38 MB, 96 clips"; "1 clip"; at least "1 MB"
```

`saveForOffline` fetches the manifest and stores it, fetches each page and stores it, fetches every static URL found in those pages (the worker stores them in the shell cache), then each asset, calling `onProgress` per item; items already in the cache are skipped, so a retry resumes. It writes a small synthetic entry `/__saved-meta` (JSON `{ savedAt, clips, bytes }`) into the job's cache last. Any failed URL is returned in `failed` and the meta entry is written only when `failed` is empty.

- [ ] **Step 1: Write the failing tests**

```ts
// offline-save.test.ts (fake cache storage and fetch)
it("planSave lists three pages per bank, one per pitch, the manifest URL and one asset URL per clip, with the byte total");
it("saveForOffline stores the manifest, the pages, the static files and every clip in the job's cache and reports progress to done equal to total");
it("a retry skips what is already cached");
it("a failing asset is reported in failed and no saved meta is written");
it("it fetches with credentials include and never sends data anywhere but the app's own origin");
it("readSavedMeta returns the date, clip count and bytes once saved and null before");
it("deleteSaved removes the job's cache only, not another job's or another user's");
it("extractStaticUrls finds /_next/static URLs in script src and link href and ignores other URLs");
// offline-register.test.ts
it("registers /sw.js?build=<id> with scope /");
it("returns null when serviceWorker is unsupported or in development");
// offline-format.test.ts
it("formatSaveSize reads '38 MB, 96 clips' and '1 MB, 1 clip' at the smallest");
it("the cache name rule here equals the one in public/sw.js");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/offline-save.test.ts tests/unit/offline-register.test.ts tests/unit/offline-format.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the four files**

All client-safe: no database, no Node modules. Pages are saved under their exact URLs; the worker matches them through `normalizePageKey`. `lib/offline/copy.ts` holds the proposed offline copy (Task 51 and 53 fill it).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/offline-save.test.ts tests/unit/offline-register.test.ts tests/unit/offline-format.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/offline tests/unit
git commit -m "feat(offline): service worker registration and Save for offline"
```

**Acceptance:** (1) Save for offline stores the manifest, the Listen, Drill and Quick-fire pages and every `done` segment the plan needs, with the total shown first (spec 5.9). (2) A retry resumes. (3) Only the app's own origin is contacted.

---

### Task 51: Offline mark queue and sync

**Files:**
- Create: `lib/offline/queue.ts`, `lib/offline/idb.ts`, `lib/offline/sync.ts`, `lib/offline/submit-mark.ts`, `components/offline/offline-provider.tsx`, `components/offline/sync-status.tsx`
- Modify: `components/prep/mark-buttons.tsx` (marks go through `submitMark`, and the chosen level shows at once), `app/(app)/layout.tsx` (mounts `<OfflineProvider userHash buildId>`)
- Test: `tests/unit/offline-queue.test.ts`, `tests/unit/offline-sync.test.ts`, `tests/unit/sync-status.test.tsx`, `tests/integration/prep-offline-replay.test.ts`

**Interfaces:**
- Consumes: `markQuestionAction` (Task 9), `userHash` from `lib/storage/keys.ts` (computed on the server and passed as a prop), `registerServiceWorker` (Task 50), `useAnnounce`.
- Produces:

```ts
export const MAX_FAILURES = 10;
export type QueuedMark = { id: string; userHash: string; scope: "job" | "library"; opportunityId: string | null; questionKey: string; level: MarkLevel; markedAt: string; drilled: boolean; failures: number };
export type QueueState = { marks: QueuedMark[] };
export type QueueAction = { type: "enqueue"; mark: QueuedMark } | { type: "sent"; id: string } | { type: "failed"; id: string } | { type: "retry"; id: string } | { type: "discard"; id: string } | { type: "clear_user"; userHash: string };
export function queueReducer(state: QueueState, action: QueueAction): QueueState;
export function pendingFor(state: QueueState, userHash: string): QueuedMark[];          // oldest markedAt first, only that user
export function stuckFor(state: QueueState, userHash: string): QueuedMark[];            // failures >= MAX_FAILURES
export function waitingLine(count: number): string;                                      // "3 marks waiting to sync", "1 mark waiting to sync"
export async function drainQueue(input: { userHash: string; load(): Promise<QueuedMark[]>; send(mark: QueuedMark): Promise<"sent" | "network" | "rejected">; apply(action: QueueAction): Promise<void> }): Promise<{ sent: number; remaining: number }>;
export async function submitMark(input: MarkSubmit, deps: { userHash: string; online(): boolean; send: ...; enqueue: ... }): Promise<{ queued: boolean }>;
```

Rules (spec 5.7, 5.9): `submitMark` tries `markQuestionAction` when online and enqueues on a thrown network error or when offline; a queued mark keeps its original `markedAt`; `drainQueue` sends in `markedAt` order, stops at the first network failure (adding one failure to that mark), treats a `not_found` or `invalid` result as `rejected` and discards it, never auto-retries a mark with `MAX_FAILURES` failures (it shows with "Retry" and "Discard"), and handles only the given `userHash`. Drain runs on the browser's `online` event, when the app opens and after each enqueue while online. The server's newer-`markedAt`-wins rule (Task 7) settles conflicts.

- [ ] **Step 1: Write the failing tests**

```ts
// offline-queue.test.ts
it("enqueue adds a mark and sent removes it");
it("failed adds one failure and a mark with 10 failures is stuck");
it("retry resets failures to 0 and discard removes the mark");
it("pendingFor returns one user's marks oldest first and never another user's");
it("clear_user removes only that user's marks");
it("waitingLine reads '3 marks waiting to sync' and '1 mark waiting to sync'");
// offline-sync.test.ts
it("drainQueue sends in markedAt order and removes each sent mark");
it("it stops at the first network failure and counts one failure on that mark");
it("a rejected mark is discarded and the drain goes on");
it("a stuck mark is skipped and left for Retry and Discard");
it("it never sends another user's marks");
it("submitMark sends at once when online and enqueues when offline or when the send throws");
it("a queued mark keeps its original markedAt");
// sync-status.test.tsx
it("shows '3 marks waiting to sync' in a polite live region until the queue drains");
it("a stuck mark shows with Retry and Discard buttons that dispatch retry and discard");
it("shows nothing when the queue is empty");
// prep-offline-replay.test.ts (PGlite, markQuestionAction harness)
it("an offline mark replayed after a newer mark made on the desktop does not override it");
it("an offline mark replayed on an empty slot applies with its own markedAt");
it("a replay for a deleted job is not_found and the client discards it");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/offline-queue.test.ts tests/unit/offline-sync.test.ts tests/unit/sync-status.test.tsx tests/integration/prep-offline-replay.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the reducer, the sync, the IndexedDB adapter and the components**

`idb.ts` is a thin adapter: database `jobsmith-offline`, object store `marks` with key path `id`, functions `allMarks`, `putMark`, `deleteMark`, `deleteForUser`; covered by the end to end spec, not by unit tests. `OfflineProvider` registers the worker with `buildId` (from `process.env.NEXT_PUBLIC_BUILD_ID`), runs a drain on mount and on `online`, and renders `<SyncStatus>` in the shell as a small line at the bottom of the viewport. `MarkButtons` shows the new level optimistically and keeps it when the mark is queued.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/offline-queue.test.ts tests/unit/offline-sync.test.ts tests/unit/sync-status.test.tsx tests/integration/prep-offline-replay.test.ts tests/unit/mark-chip.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/offline components/offline components/prep/mark-buttons.tsx "app/(app)/layout.tsx" tests
git commit -m "feat(offline): mark queue with sync and conflict rules"
```

**Acceptance:** (1) Marks made offline go to an IndexedDB queue and post when the browser fires `online` or the app opens, with their original `marked_at` (spec 5.9, 5.7). (2) "3 marks waiting to sync" shows until the queue drains; after 10 failures "Retry" and "Discard" (spec 5.9, 6). (3) A queue is per user hash (Review Focus 5).

---

### Task 52: Hub offline panel and install hint

**Files:**
- Create: `components/prep/offline-panel.tsx`, `components/prep/install-hint.tsx`
- Modify: `components/prep/prep-hub.tsx` (the panel and the hint, per bank card group), `lib/offline/copy.ts`, `docs/design-system.md`
- Test: `tests/unit/offline-panel.test.tsx`, `tests/unit/install-hint.test.tsx`

**Interfaces:**
- Consumes: `planSave`, `saveForOffline`, `readSavedMeta`, `deleteSaved`, `formatSaveSize` (Task 50), `PrepManifest` (fetched from `/api/prep/<slug>`), `userHash` passed from the page, `LocalTime`.
- Produces: `<OfflinePanel slug userHash>` and `<InstallHint>`. The panel fetches the manifest on mount, shows "Save for offline" with the size it will take ("38 MB, 96 clips"), a progress line while saving ("Saving 40 of 96"), then "Saved" with the date and a "Remove saved copy" button; a failed save lists how many items failed and offers "Try again". The hint is a collapsible card, shown while the app is not running standalone (`matchMedia("(display-mode: standalone)")` is false). Proposed copy: "Install Jobsmith from the share sheet or the browser menu. Safari clears saved jobs after seven days of not opening the site unless the app is on the home screen. Audio on a locked screen depends on your phone." Hidden when Cache Storage is unavailable.

- [ ] **Step 1: Write the failing tests**

```ts
// offline-panel.test.tsx (jsdom; fake caches, fetch and manifest)
it("shows 'Save for offline' with the size '38 MB, 96 clips' before anything is saved");
it("clicking it saves and shows progress, then 'Saved' with the date");
it("a failed save shows the failed count and 'Try again', and a retry resumes");
it("'Remove saved copy' deletes the job's cache and returns to 'Save for offline'");
it("announces 'Saved for offline.' through the live region");
it("is hidden when Cache Storage is unavailable");
// install-hint.test.tsx
it("shows the install hint with the share sheet, the seven day Safari note and the locked screen note");
it("is hidden when the app runs standalone");
it("the copy has no exclamation mark");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/offline-panel.test.tsx tests/unit/install-hint.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the panel, the hint and the hub wiring**

The page passes `userHash(user.id)` to the hub. The panel never saves without the user's click. Run the unslop render tier at 375 and 1280 pixels, light and dark.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/offline-panel.test.tsx tests/unit/install-hint.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/prep lib/offline/copy.ts docs/design-system.md tests/unit
git commit -m "feat(offline): Save for offline panel and install hint on the hub"
```

**Acceptance:** (1) "Save for offline" shows the total before starting and the progress while saving; "Saved" shows the date once cached (spec 5.2, 5.9). (2) The hint explains installing from the share sheet or browser menu and names both platform limits (spec 5.9). (3) Saving is the only thing that fills a job's cache (spec 5.9).

---

### Task 53: Sign-out clearing and the offline page

**Files:**
- Create: `app/offline/page.tsx`, `components/offline/offline-notice.tsx`, `lib/offline/clear.ts`
- Modify: `components/app-shell.tsx` (`AppShell` takes a `userHash` prop and wraps `onSignOut`: it awaits `clearOfflineData(userHash)` and then calls the original), `app/(app)/layout.tsx` (passes `userHash(user.id)`)
- Test: `tests/unit/offline-clear.test.ts`, `tests/unit/offline-notice.test.tsx`

**Interfaces:**
- Consumes: the `clear-user` message of `public/sw.js` (Task 48), `deleteForUser` of `lib/offline/idb.ts` (Task 51), `readSavedMeta` and the cache naming (Task 50), the cached manifest at `/api/prep/<slug>`.
- Produces: `clearOfflineData(userHash: string, deps?: { serviceWorker?: ServiceWorkerContainer; caches?: CacheStorage; clearQueue?(userHash: string): Promise<void> }): Promise<{ deleted: string[] }>` posts `{ type: "clear-user", userHash }` to the controlling worker and waits at most 2 seconds for its answer, then deletes any `jobsmith-prep-<userHash>-*` cache itself (so sign-out clears even without a controlling worker) and clears that user's queued marks. `/offline` is a public page (no `requireUser()`, an allowed exception: it carries no user data and is served from the shell cache) with the offline notice "You are offline." and, from Cache Storage, a list headed "Open a saved job": one entry per saved job (its cached manifest gives the job title and its banks) linking to that job's Listen, Drill and Quick-fire pages; with nothing saved it says "Nothing is saved on this device yet."

- [ ] **Step 1: Write the failing tests**

```ts
// offline-clear.test.ts
it("posts clear-user with the user hash to the controlling worker and waits for its answer");
it("deletes the user's prep caches itself when no worker answers within 2 seconds");
it("never deletes another user's caches");
it("clears that user's queued marks");
it("resolves even when serviceWorker and caches are missing");
// offline-notice.test.tsx
it("lists each saved job with links to its Listen, Drill and Quick-fire pages, under 'Open a saved job'");
it("shows 'Nothing is saved on this device yet.' when no job is saved");
it("the page needs no session and its copy has no exclamation mark");
// app-shell test (extend the existing shell test if present, else add)
it("the sign-out control clears offline data before it signs out");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/offline-clear.test.ts tests/unit/offline-notice.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the clearing, the page and the shell change**

The proxy matcher already excludes `/offline` (Task 47). `app/offline/page.tsx` is a small server component that renders the client `OfflineNotice`; the service worker precaches it on install (Task 48) so it opens with no network.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/offline-clear.test.ts tests/unit/offline-notice.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/offline components/offline lib/offline/clear.ts components/app-shell.tsx "app/(app)/layout.tsx" tests/unit
git commit -m "feat(offline): sign-out clears saved jobs and queued marks, plus the offline page"
```

**Acceptance:** (1) Sign-out posts a message to the service worker that deletes every cache of that user hash (spec 5.9). (2) An unsaved page offline shows the offline notice with "Open a saved job" (spec 6). (3) The queue of the signed-out user is cleared (Review Focus 5).

---

### Task 54: End to end, docs and ship

**Files:**
- Create: `tests/e2e/prep-phone.spec.ts`
- Modify: `README.md` (a Phone section: install, Save for offline, platform limits, `pnpm icons`), `docs/design-system.md`, `playwright.config.ts` (the `prep-*` projects already run this spec)
- Test: the spec above

**Blocked on:** a real phone for the done-when check (installed app, airplane mode). The Playwright spec proves the same path with `context.setOffline`. WebKit's service worker support in Playwright can lag Chromium's; the spec skips an engine with `test.skip` and a stated reason only when `navigator.serviceWorker` is missing there, and the skip is listed in the pull request.

**Interfaces:**
- Consumes: Task 14 and Task 31 helpers, `scanForViolations`, `createToken`, `runCli`.
- Produces: the Milestone 10 end to end proof.

- [ ] **Step 1: Write the failing e2e spec**

```ts
test("the manifest and icons load without a session and the app registers a service worker", ...);
test("Save for offline shows the size, saves, and shows Saved with the date", ...);
test("offline, a saved bank plays: Listen advances and the clips come from the cache", ...);
//   context.setOffline(true); goto /jobs/<slug>/listen?doc=job:answers-full; the transcript advances; requests to /api/assets fail on the network so playback proves the cache
test("a mark made offline shows '1 mark waiting to sync' and appears on the hub after reconnecting", ...);
//   mark Solid offline; setOffline(false); the waiting line clears; reload the hub in the same context: the chip is Solid
test("a newer mark made online is not overridden by an older offline mark", ...);
test("an unsaved page offline shows the offline notice with 'Open a saved job'", ...);
test("Drill and Quick-fire run offline from the saved pages and their marks queue", ...);
test("sign-out deletes every jobsmith-prep cache and the queued marks", ...);   // caches.keys() and indexedDB inspected in the page
test("the offline page passes axe in light and dark", ...);
test("the install hint shows in the browser and not in standalone", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e --project=prep-chromium`
Expected: FAIL until Tasks 47 to 53 are in, then PASS.

- [ ] **Step 3: Write the docs**

In `README.md` describe installing (share sheet or browser menu), "Save for offline", what is and is not cached (saved jobs' players only), and the Safari seven day rule. Add the new components to `docs/design-system.md`.

- [ ] **Step 4: Run the full suite, the preview check and the phone check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit (or its recorded skip) and the phone project. Then on the owner's phone, once: open the deployed preview over HTTPS, install it, Save for offline on a job, switch to airplane mode, open the app, play the saved bank, mark one question, reconnect, and confirm on the desktop that the mark shows. Record the result and the phone model in the pull request (spec 8). Report the preview URL.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e README.md docs/design-system.md playwright.config.ts
git commit -m "test(prep): Milestone 10 end to end, docs and ship"
```

**Acceptance:** (1) The done-when sentence passes in Playwright and once on a real installed phone app in airplane mode (spec 8, 9). (2) Axe has zero violations on the offline page in light and dark (spec 8). (3) Sign-out leaves no cache or queued mark of the user (spec 5.9).
