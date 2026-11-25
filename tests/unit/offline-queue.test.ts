import { describe, it, expect } from "vitest";
import {
  MAX_FAILURES,
  createMemoryStore,
  pendingFor,
  queueReducer,
  stuckFor,
  waitingLine,
  type QueueState,
  type QueuedMark,
} from "@/lib/offline/queue";

let n = 0;
function mark(over: Partial<QueuedMark> = {}): QueuedMark {
  n += 1;
  return {
    id: `m${n}`,
    userHash: "aaaa",
    scope: "job",
    opportunityId: "11111111-1111-4111-8111-111111111111",
    questionKey: "0123456789abcdef",
    level: "shaky",
    markedAt: "2026-11-21T10:00:00.000Z",
    drilled: false,
    failures: 0,
    ...over,
  };
}
const empty: QueueState = { marks: [] };

describe("queueReducer", () => {
  it("enqueue adds a mark and sent removes it", () => {
    const m = mark();
    const one = queueReducer(empty, { type: "enqueue", mark: m });
    expect(one.marks).toEqual([m]);
    expect(queueReducer(one, { type: "enqueue", mark: m }).marks).toHaveLength(1); // same id twice is one mark
    expect(queueReducer(one, { type: "sent", id: m.id }).marks).toEqual([]);
  });

  it("failed adds one failure and a mark with 10 failures is stuck", () => {
    let state = queueReducer(empty, { type: "enqueue", mark: mark({ id: "x" }) });
    for (let i = 0; i < MAX_FAILURES - 1; i++) state = queueReducer(state, { type: "failed", id: "x" });
    expect(state.marks[0].failures).toBe(9);
    expect(stuckFor(state, "aaaa")).toEqual([]);
    expect(pendingFor(state, "aaaa")).toHaveLength(1);
    state = queueReducer(state, { type: "failed", id: "x" });
    expect(state.marks[0].failures).toBe(10);
    expect(stuckFor(state, "aaaa")).toHaveLength(1);
    expect(pendingFor(state, "aaaa")).toEqual([]);
  });

  it("retry resets failures to 0 and discard removes the mark", () => {
    const state: QueueState = { marks: [mark({ id: "s", failures: 10 }), mark({ id: "t", failures: 4 })] };
    const retried = queueReducer(state, { type: "retry", id: "s" });
    expect(retried.marks.find((m) => m.id === "s")!.failures).toBe(0);
    expect(retried.marks.find((m) => m.id === "t")!.failures).toBe(4);
    expect(pendingFor(retried, "aaaa")).toHaveLength(2);
    expect(queueReducer(state, { type: "discard", id: "t" }).marks.map((m) => m.id)).toEqual(["s"]);
  });

  it("an action for an unknown id changes nothing", () => {
    const state: QueueState = { marks: [mark({ id: "a" })] };
    expect(queueReducer(state, { type: "failed", id: "zzz" }).marks).toEqual(state.marks);
    expect(queueReducer(state, { type: "sent", id: "zzz" }).marks).toEqual(state.marks);
  });

  it("clear_user removes only that user's marks", () => {
    const state: QueueState = { marks: [mark({ id: "a", userHash: "aaaa" }), mark({ id: "b", userHash: "bbbb" }), mark({ id: "c", userHash: "aaaa" })] };
    expect(queueReducer(state, { type: "clear_user", userHash: "aaaa" }).marks.map((m) => m.id)).toEqual(["b"]);
  });
});

describe("pendingFor", () => {
  it("returns one user's marks oldest first and never another user's", () => {
    const state: QueueState = {
      marks: [
        mark({ id: "late", markedAt: "2026-11-21T12:00:00.000Z" }),
        mark({ id: "other", userHash: "bbbb", markedAt: "2026-11-21T08:00:00.000Z" }),
        mark({ id: "early", markedAt: "2026-11-21T09:00:00.000Z" }),
      ],
    };
    expect(pendingFor(state, "aaaa").map((m) => m.id)).toEqual(["early", "late"]);
    expect(pendingFor(state, "bbbb").map((m) => m.id)).toEqual(["other"]);
    expect(pendingFor(state, "cccc")).toEqual([]);
  });
});

describe("waitingLine", () => {
  it("reads '3 marks waiting to sync' and '1 mark waiting to sync'", () => {
    expect(waitingLine(3)).toBe("3 marks waiting to sync");
    expect(waitingLine(1)).toBe("1 mark waiting to sync");
  });
});

describe("createMemoryStore", () => {
  it("keeps, replaces and deletes marks, and deletes by user", async () => {
    const store = createMemoryStore();
    await store.put(mark({ id: "a" }));
    await store.put(mark({ id: "b", userHash: "bbbb" }));
    await store.put(mark({ id: "a", failures: 2 }));
    expect((await store.all()).map((m) => [m.id, m.failures]).sort()).toEqual([["a", 2], ["b", 0]]);
    await store.deleteForUser("aaaa");
    expect((await store.all()).map((m) => m.id)).toEqual(["b"]);
    await store.delete("b");
    expect(await store.all()).toEqual([]);
  });
});
