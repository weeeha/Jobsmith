"use client";

import * as React from "react";

import { useAnnounce } from "@/components/live-announcer";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { OFFLINE_COPY } from "@/lib/offline/copy";
import { formatSaveSize } from "@/lib/offline/format";
import { deleteSaved, readSavedMeta, saveForOffline, type SavedMeta } from "@/lib/offline/save";
import type { PrepManifest } from "@/lib/prep/manifest";

const COPY = OFFLINE_COPY.panel;
const noopSubscribe = () => () => {};

type View =
  | { phase: "loading" }
  | { phase: "ready"; size: string }
  | { phase: "size_failed" }
  | { phase: "saving"; done: number; total: number }
  | { phase: "failed"; count: number }
  | { phase: "saved"; savedAt: Date; size: string };

export type OfflinePanelDeps = { fetch?: typeof fetch; caches?: CacheStorage };

/**
 * One job's Save for offline card on the Prep hub. It reads the prep manifest
 * on mount to show what saving will take, and never saves until the button is
 * pressed. Hidden when the browser has no Cache Storage.
 */
export function OfflinePanel(props: { slug: string; userHash: string; deps?: OfflinePanelDeps }): React.ReactElement | null {
  const { slug, userHash } = props;
  const announce = useAnnounce();
  const hasCaches = React.useSyncExternalStore(
    noopSubscribe,
    () => typeof window !== "undefined" && "caches" in window,
    () => false,
  );
  const cachesApi = props.deps?.caches ?? (hasCaches ? window.caches : undefined);
  const fetchApi = props.deps?.fetch;
  const [view, setView] = React.useState<View>({ phase: "loading" });
  const [attempt, setAttempt] = React.useState(0);
  const controller = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!cachesApi) return;
    let cancelled = false;
    (async () => {
      try {
        const meta = await readSavedMeta(cachesApi, userHash, slug);
        if (cancelled) return;
        if (meta) {
          setView({ phase: "saved", savedAt: meta.savedAt, size: formatSaveSize(meta.bytes, meta.clips) });
          return;
        }
        const res = await (fetchApi ?? fetch)(`/api/prep/${slug}`, { credentials: "include" });
        if (!res.ok || res.redirected) throw new Error(`manifest ${res.status}`);
        const manifest = (await res.json()) as PrepManifest;
        if (!cancelled) setView({ phase: "ready", size: formatSaveSize(manifest.totalBytes, manifest.assets.length) });
      } catch {
        if (!cancelled) setView({ phase: "size_failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cachesApi, fetchApi, slug, userHash, attempt]);

  React.useEffect(() => () => controller.current?.abort(), []);

  if (!cachesApi) return null;

  async function start() {
    if (!cachesApi) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setView({ phase: "saving", done: 0, total: 1 });
    try {
      const result = await saveForOffline({
        slug,
        userHash,
        fetch: fetchApi ?? fetch,
        caches: cachesApi,
        signal: abort.signal,
        onProgress: (p) => {
          if (!abort.signal.aborted) setView({ phase: "saving", done: p.done, total: p.total });
        },
      });
      if (abort.signal.aborted) return;
      if (result.ok) {
        const meta: SavedMeta | null = await readSavedMeta(cachesApi, userHash, slug);
        setView({
          phase: "saved",
          savedAt: result.savedAt,
          size: meta ? formatSaveSize(meta.bytes, meta.clips) : "",
        });
        announce(COPY.savedAnnouncement);
      } else {
        setView({ phase: "failed", count: result.failed.length });
      }
    } catch {
      if (!abort.signal.aborted) setView({ phase: "failed", count: 1 });
    }
  }

  async function removeSaved() {
    if (!cachesApi) return;
    await deleteSaved(cachesApi, userHash, slug);
    announce(COPY.removedAnnouncement);
    setView({ phase: "loading" });
    setAttempt((n) => n + 1);
  }

  return (
    <section
      aria-label={COPY.heading}
      className="flex min-w-0 flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <h3 className="text-sm font-medium text-foreground">{COPY.heading}</h3>
      {view.phase === "saved" ? (
        <>
          <p className="min-w-0 break-words text-sm text-foreground">
            <span className="font-medium">{COPY.saved}</span>
            <span className="text-muted-foreground">
              {" · "}
              <LocalTime value={view.savedAt} />
              {view.size ? ` · ${view.size}` : ""}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={removeSaved}>
              {COPY.remove}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="min-w-0 break-words text-sm text-muted-foreground">
            {view.phase === "saving"
              ? COPY.saving(view.done, view.total)
              : view.phase === "failed"
                ? COPY.failedLine(view.count)
                : view.phase === "size_failed"
                  ? COPY.sizeFailed
                  : view.phase === "ready"
                    ? view.size
                    : COPY.help}
          </p>
          {view.phase === "ready" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={start}>
                {COPY.save}
              </Button>
            </div>
          ) : null}
          {view.phase === "failed" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={start}>
                {COPY.retry}
              </Button>
            </div>
          ) : null}
          {view.phase === "size_failed" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setView({ phase: "loading" });
                  setAttempt((n) => n + 1);
                }}
              >
                {COPY.retry}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
