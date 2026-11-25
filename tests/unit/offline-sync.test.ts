import { describe, it, expect, vi } from "vitest";
import { MAX_FAILURES, createMemoryStore, pendingFor, type QueueAction, type QueuedMark } from "@/lib/offline/queue";
import { drainQueue, exclusive, persistAction, sendQueuedMark, type SendOutcome } from "@/lib/offline/sync";
import { submitMark, type MarkActionResult } from "@/lib/offline/submit-mark";

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
    markedAt: `2026-11-21T10:0${n % 10}:00.000Z`,
    drilled: false,
    failures: 0,
    ...over,
  };
}

async function drain(marks: QueuedMark[], send: (m: QueuedMark) => Promise<SendOutcome>, userHash = "aaaa") {
  const store = createMemoryStore(marks);
  const result = await drainQueue({ userHash, load: () => store.all(), send, apply: (a: QueueAction) => persistAction(store, a) });
  return { store, result };
}

describe("drainQueue", () => {
  it("sends in markedAt order and removes each sent mark", async () => {
    const marks = [
      mark({ id: "c", markedAt: "2026-11-21T12:00:00.000Z" }),
      mark({ id: "a", markedAt: "2026-11-21T09:00:00.000Z" }),
      mark({ id: "b", markedAt: "2026-11-21T10:00:00.000Z" }),
    ];
    const order: string[] = [];
    const { store, result } = await drain(marks, async (m) => {
      order.push(m.id);
      return "sent";
    });
    expect(order).toEqual(["a", "b", "c"]);
    expect(result).toEqual({ sent: 3, remaining: 0 });
    expect(await store.all()).toEqual([]);
  });

  it("it stops at the first network failure and counts one failure on that mark", async () => {
    const marks = [mark({ id: "a", markedAt: "2026-11-21T09:00:00.000Z" }), mark({ id: "b", markedAt: "2026-11-21T10:00:00.000Z" }), mark({ id: "c", markedAt: "2026-11-21T11:00:00.000Z" })];
    const send = vi.fn(async (m: QueuedMark): Promise<SendOutcome> => (m.id === "b" ? "network" : "sent"));
    const { store, result } = await drain(marks, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 1, remaining: 2 });
    const left = await store.all();
    expect(left.map((m) => [m.id, m.failures]).sort()).toEqual([["b", 1], ["c", 0]]);
  });

  it("a rejected mark is discarded and the drain goes on", async () => {
    const marks = [mark({ id: "a", markedAt: "2026-11-21T09:00:00.000Z" }), mark({ id: "b", markedAt: "2026-11-21T10:00:00.000Z" })];
    const { store, result } = await drain(marks, async (m) => (m.id === "a" ? "rejected" : "sent"));
    expect(result).toEqual({ sent: 1, remaining: 0 });
    expect(await store.all()).toEqual([]);
  });

  it("a stuck mark is skipped and left for Retry and Discard", async () => {
    const marks = [mark({ id: "stuck", failures: MAX_FAILURES, markedAt: "2026-11-21T08:00:00.000Z" }), mark({ id: "ok", markedAt: "2026-11-21T09:00:00.000Z" })];
    const send = vi.fn(async (): Promise<SendOutcome> => "sent");
    const { store, result } = await drain(marks, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 1, remaining: 0 });
    expect((await store.all()).map((m) => m.id)).toEqual(["stuck"]);
  });

  it("it never sends another user's marks", async () => {
    const marks = [mark({ id: "mine" }), mark({ id: "theirs", userHash: "bbbb" })];
    const sent: string[] = [];
    const { store } = await drain(marks, async (m) => {
      sent.push(m.id);
      return "sent";
    });
    expect(sent).toEqual(["mine"]);
    expect((await store.all()).map((m) => m.id)).toEqual(["theirs"]);
    expect(pendingFor({ marks: await store.all() }, "aaaa")).toEqual([]);
  });
});

describe("sendQueuedMark", () => {
  const okResult: MarkActionResult = { ok: true, data: { level: "shaky", markedAt: "x", drillCount: 0, applied: true } };
  it("maps the action's answer: ok is sent, not_found and invalid are rejected, a throw or another failure is the network", async () => {
    const m = mark();
    expect(await sendQueuedMark(m, async () => okResult)).toBe("sent");
    const notApplied: MarkActionResult = { ok: true, data: { level: "solid", markedAt: "x", drillCount: 0, applied: false } };
    expect(await sendQueuedMark(m, async () => notApplied)).toBe("sent"); // the server kept a newer mark: still settled
    expect(await sendQueuedMark(m, async () => ({ ok: false, code: "not_found", message: "gone" }))).toBe("rejected");
    expect(await sendQueuedMark(m, async () => ({ ok: false, code: "invalid", message: "bad" }))).toBe("rejected");
    expect(await sendQueuedMark(m, async () => ({ ok: false, code: "unexpected", message: "boom" }))).toBe("network");
    expect(await sendQueuedMark(m, async () => { throw new TypeError("Failed to fetch"); })).toBe("network");
  });

  it("sends the mark's own markedAt, not the time of the send", async () => {
    const m = mark({ markedAt: "2026-11-20T08:15:00.000Z", level: "solid", drilled: true });
    const action = vi.fn(async () => okResult);
    await sendQueuedMark(m, action);
    expect(action).toHaveBeenCalledWith({
      opportunityId: m.opportunityId, scope: "job", questionKey: m.questionKey, level: "solid", markedAt: "2026-11-20T08:15:00.000Z", drilled: true,
    });
  });
});

describe("persistAction", () => {
  it("writes only the changes the reducer makes", async () => {
    const store = createMemoryStore([mark({ id: "a" })]);
    await persistAction(store, { type: "enqueue", mark: mark({ id: "b" }) });
    await persistAction(store, { type: "failed", id: "a" });
    await persistAction(store, { type: "discard", id: "b" });
    expect((await store.all()).map((m) => [m.id, m.failures])).toEqual([["a", 1]]);
  });
});

describe("exclusive", () => {
  it("shares one run between overlapping callers and allows the next run after it ends", async () => {
    let runs = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const once = exclusive(async () => {
      runs += 1;
      await gate;
      return runs;
    });
    const a = once();
    const b = once();
    release();
    expect(await a).toBe(1);
    expect(await b).toBe(1);
    expect(await once()).toBe(2);
  });
});

describe("submitMark", () => {
  const input = { opportunityId: "11111111-1111-4111-8111-111111111111", scope: "job" as const, questionKey: "0123456789abcdef", level: "okay" as const, drilled: false };
  const okResult: MarkActionResult = { ok: true, data: { level: "okay", markedAt: "x", drillCount: 0, applied: true } };
  const fixed = new Date("2026-11-21T10:30:00.000Z");

  it("sends at once when online and enqueues when offline or when the send throws", async () => {
    const enqueue = vi.fn(async () => {});
    const send = vi.fn(async () => okResult);
    const base = { userHash: "aaaa", enqueue, send, now: () => fixed, newId: () => "id1" };

    expect(await submitMark(input, { ...base, online: () => true })).toEqual({ queued: false, result: okResult });
    expect(enqueue).not.toHaveBeenCalled();

    send.mockClear();
    expect(await submitMark(input, { ...base, online: () => false })).toEqual({ queued: true });
    expect(send).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);

    enqueue.mockClear();
    const throwing = vi.fn(async (): Promise<MarkActionResult> => { throw new TypeError("Failed to fetch"); });
    expect(await submitMark(input, { ...base, send: throwing, online: () => true })).toEqual({ queued: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("a server refusal is an answer, not a reason to queue", async () => {
    const enqueue = vi.fn(async () => {});
    const refused: MarkActionResult = { ok: false, code: "not_found", message: "gone" };
    const out = await submitMark(input, { userHash: "aaaa", online: () => true, send: async () => refused, enqueue });
    expect(out).toEqual({ queued: false, result: refused });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("a queued mark keeps its original markedAt, its user hash and zero failures", async () => {
    const queued: QueuedMark[] = [];
    await submitMark(input, {
      userHash: "aaaa", online: () => false, send: async () => okResult, enqueue: async (m) => void queued.push(m), now: () => fixed, newId: () => "id9",
    });
    expect(queued).toEqual([{ ...input, id: "id9", userHash: "aaaa", markedAt: fixed.toISOString(), failures: 0 }]);
  });
});
