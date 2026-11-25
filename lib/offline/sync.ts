import { MAX_FAILURES, queueReducer, type QueueAction, type QueueStore, type QueuedMark } from "./queue";
import type { MarkActionResult } from "./submit-mark";

export type SendOutcome = "sent" | "network" | "rejected";

/**
 * Sends one user's waiting marks, oldest first. A network failure adds one
 * failure to that mark and ends the run (the rest would fail the same way); a
 * mark the server refuses is discarded; a stuck mark is left for Retry and
 * Discard. Another user's marks are never touched.
 */
export async function drainQueue(input: {
  userHash: string;
  load(): Promise<QueuedMark[]>;
  send(mark: QueuedMark): Promise<SendOutcome>;
  apply(action: QueueAction): Promise<void>;
}): Promise<{ sent: number; remaining: number }> {
  const marks = (await input.load())
    .filter((m) => m.userHash === input.userHash && m.failures < MAX_FAILURES)
    .sort((a, b) => Date.parse(a.markedAt) - Date.parse(b.markedAt) || a.id.localeCompare(b.id));
  let sent = 0;
  let handled = 0;
  for (const mark of marks) {
    const outcome = await input.send(mark);
    if (outcome === "network") {
      await input.apply({ type: "failed", id: mark.id });
      break;
    }
    await input.apply({ type: outcome === "sent" ? "sent" : "discard", id: mark.id });
    handled += 1;
    if (outcome === "sent") sent += 1;
  }
  return { sent, remaining: marks.length - handled };
}

/** Turns the mark server action into a drain outcome: a throw is the network. */
export async function sendQueuedMark(mark: QueuedMark, action: (input: MarkPayload) => Promise<MarkActionResult>): Promise<SendOutcome> {
  let result: MarkActionResult;
  try {
    result = await action({
      opportunityId: mark.opportunityId,
      scope: mark.scope,
      questionKey: mark.questionKey,
      level: mark.level,
      markedAt: mark.markedAt,
      drilled: mark.drilled,
    });
  } catch {
    return "network";
  }
  if (result.ok) return "sent"; // applied or not, the server has settled it
  // not_found (a deleted job or question) and invalid will never succeed.
  return result.code === "not_found" || result.code === "invalid" ? "rejected" : "network";
}

export type MarkPayload = {
  opportunityId: string | null;
  scope: "job" | "library";
  questionKey: string;
  level: QueuedMark["level"];
  markedAt: string;
  drilled: boolean;
};

/** Runs the reducer over the stored marks and writes back only what changed. */
export async function persistAction(store: QueueStore, action: QueueAction): Promise<void> {
  const before = await store.all();
  const after = queueReducer({ marks: before }, action).marks;
  const old = new Map(before.map((m) => [m.id, m]));
  const next = new Map(after.map((m) => [m.id, m]));
  for (const id of old.keys()) if (!next.has(id)) await store.delete(id);
  for (const [id, mark] of next) {
    const prev = old.get(id);
    if (!prev || prev.failures !== mark.failures) await store.put(mark);
  }
}

/** Runs one drain at a time: a second call while one is running shares its result. */
export function exclusive<T>(run: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    inflight ??= run().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}
