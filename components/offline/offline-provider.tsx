"use client";

import * as React from "react";

import { markQuestionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { SyncStatus } from "@/components/offline/sync-status";
import { useAnnounce } from "@/components/live-announcer";
import { OFFLINE_COPY } from "@/lib/offline/copy";
import { createIdbStore, idbAvailable } from "@/lib/offline/idb";
import { pendingFor, stuckFor, createMemoryStore, type QueueAction, type QueueStore, type QueuedMark } from "@/lib/offline/queue";
import { registerServiceWorker } from "@/lib/offline/register";
import { submitMark, type MarkSubmit } from "@/lib/offline/submit-mark";
import { drainQueue, exclusive, persistAction, sendQueuedMark } from "@/lib/offline/sync";

export type OfflineApi = {
  userHash: string;
  /** Sends a mark now, or queues it when offline; see submitMark. */
  submit(input: MarkSubmit): ReturnType<typeof submitMark>;
  retry(id: string): void;
  discard(id: string): void;
};

const OfflineContext = React.createContext<OfflineApi | null>(null);

/** Null outside the provider (a unit test, say): callers then send marks directly. */
export function useOffline(): OfflineApi | null {
  return React.useContext(OfflineContext);
}

export function OfflineProvider(props: { userHash: string; buildId: string; children: React.ReactNode }): React.ReactElement {
  const { userHash, buildId } = props;
  const announce = useAnnounce();
  // IndexedDB when the browser has it; in memory otherwise (and while rendering
  // on the server, where nothing is ever queued).
  const [store] = React.useState<QueueStore>(() => (idbAvailable() ? createIdbStore() : createMemoryStore()));
  const [marks, setMarks] = React.useState<QueuedMark[]>([]);

  const refresh = React.useCallback(async () => {
    try {
      setMarks(await store.all());
    } catch (error) {
      console.error("reading the offline queue failed", error);
    }
  }, [store]);

  const apply = React.useCallback(
    async (action: QueueAction) => {
      await persistAction(store, action);
      await refresh();
    },
    [store, refresh],
  );

  const drain = React.useMemo(
    () =>
      exclusive(async () => {
        try {
          const result = await drainQueue({
            userHash,
            load: () => store.all(),
            send: (mark) => sendQueuedMark(mark, markQuestionAction),
            apply,
          });
          if (result.sent > 0 && result.remaining === 0) announce(OFFLINE_COPY.sync.syncedAnnouncement);
        } catch (error) {
          console.error("syncing marks failed", error);
        }
        await refresh();
      }),
    [announce, apply, refresh, store, userHash],
  );

  React.useEffect(() => {
    void registerServiceWorker(buildId);
    let cancelled = false;
    store
      .all()
      .then((stored) => {
        if (!cancelled) setMarks(stored);
        if (navigator.onLine) void drain();
      })
      .catch((error) => console.error("reading the offline queue failed", error));
    const onOnline = () => void drain();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [buildId, drain, store]);

  const api = React.useMemo<OfflineApi>(
    () => ({
      userHash,
      submit: (input) =>
        submitMark(input, {
          userHash,
          online: () => navigator.onLine,
          send: markQuestionAction,
          enqueue: async (mark) => {
            await apply({ type: "enqueue", mark });
            if (navigator.onLine) void drain();
          },
        }),
      retry: (id) => {
        void apply({ type: "retry", id }).then(() => drain());
      },
      discard: (id) => {
        void apply({ type: "discard", id });
      },
    }),
    [apply, drain, userHash],
  );

  const state = { marks };
  return (
    <OfflineContext.Provider value={api}>
      {props.children}
      <SyncStatus
        waiting={pendingFor(state, userHash).length}
        stuck={stuckFor(state, userHash)}
        onRetry={api.retry}
        onDiscard={api.discard}
      />
    </OfflineContext.Provider>
  );
}
