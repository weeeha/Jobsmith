// The offline mark queue: a pure reducer over the marks waiting to sync, plus
// the small store interface the IndexedDB adapter (idb.ts) implements and the
// tests replace with an in-memory fake. Everything here is client-safe.
import type { MarkLevel } from "@/lib/prep/values";

export const MAX_FAILURES = 10;

export type QueuedMark = {
  id: string;
  userHash: string;
  scope: "job" | "library";
  opportunityId: string | null;
  questionKey: string;
  level: MarkLevel;
  // The moment the user tapped, kept through every retry: the server's newer-wins rule uses it.
  markedAt: string;
  drilled: boolean;
  failures: number;
};

export type QueueState = { marks: QueuedMark[] };

export type QueueAction =
  | { type: "enqueue"; mark: QueuedMark }
  | { type: "sent"; id: string }
  | { type: "failed"; id: string }
  | { type: "retry"; id: string }
  | { type: "discard"; id: string }
  | { type: "clear_user"; userHash: string };

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "enqueue":
      if (state.marks.some((m) => m.id === action.mark.id)) return state;
      return { marks: [...state.marks, action.mark] };
    case "sent":
    case "discard":
      return { marks: state.marks.filter((m) => m.id !== action.id) };
    case "failed":
      return { marks: state.marks.map((m) => (m.id === action.id ? { ...m, failures: m.failures + 1 } : m)) };
    case "retry":
      return { marks: state.marks.map((m) => (m.id === action.id ? { ...m, failures: 0 } : m)) };
    case "clear_user":
      return { marks: state.marks.filter((m) => m.userHash !== action.userHash) };
  }
}

const oldestFirst = (a: QueuedMark, b: QueuedMark) => Date.parse(a.markedAt) - Date.parse(b.markedAt) || a.id.localeCompare(b.id);

/** One user's marks still being tried, oldest first. Stuck marks are not here. */
export function pendingFor(state: QueueState, userHash: string): QueuedMark[] {
  return state.marks.filter((m) => m.userHash === userHash && m.failures < MAX_FAILURES).sort(oldestFirst);
}

/** One user's marks that failed MAX_FAILURES times: shown with Retry and Discard. */
export function stuckFor(state: QueueState, userHash: string): QueuedMark[] {
  return state.marks.filter((m) => m.userHash === userHash && m.failures >= MAX_FAILURES).sort(oldestFirst);
}

export function waitingLine(count: number): string {
  return `${count} ${count === 1 ? "mark" : "marks"} waiting to sync`;
}

/** Where marks live between page loads. idb.ts implements it over IndexedDB. */
export interface QueueStore {
  all(): Promise<QueuedMark[]>;
  put(mark: QueuedMark): Promise<void>;
  delete(id: string): Promise<void>;
  deleteForUser(userHash: string): Promise<void>;
}

/** In memory: the tests' fake, and the fallback when IndexedDB is unavailable. */
export function createMemoryStore(initial: QueuedMark[] = []): QueueStore {
  const marks = new Map(initial.map((m) => [m.id, m]));
  return {
    async all() {
      return [...marks.values()].map((m) => ({ ...m }));
    },
    async put(mark) {
      marks.set(mark.id, { ...mark });
    },
    async delete(id) {
      marks.delete(id);
    },
    async deleteForUser(userHash) {
      for (const [id, m] of marks) if (m.userHash === userHash) marks.delete(id);
    },
  };
}
