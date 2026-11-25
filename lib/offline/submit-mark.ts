import type { Result } from "@/lib/result";
import type { MarkLevel } from "@/lib/prep/values";
import type { QueuedMark } from "./queue";
import type { MarkPayload } from "./sync";

export type MarkActionResult = Result<{ level: MarkLevel; markedAt: string; drillCount: number; applied: boolean }, string>;

export type MarkSubmit = {
  opportunityId: string | null;
  scope: "job" | "library";
  questionKey: string;
  level: MarkLevel;
  drilled: boolean;
};

export type SubmitMarkDeps = {
  userHash: string;
  online(): boolean;
  send(payload: MarkPayload): Promise<MarkActionResult>;
  enqueue(mark: QueuedMark): Promise<void>;
  now?(): Date;
  newId?(): string;
};

/**
 * Sends the mark now when online; queues it when offline or when the send
 * throws (the network went away). The queued mark keeps the time of the tap,
 * so a replay hours later still loses to a newer mark made elsewhere.
 * `result` is the server's answer when the mark went through.
 */
export async function submitMark(input: MarkSubmit, deps: SubmitMarkDeps): Promise<{ queued: boolean; result?: MarkActionResult }> {
  const markedAt = (deps.now?.() ?? new Date()).toISOString();
  if (deps.online()) {
    try {
      return { queued: false, result: await deps.send({ ...input, markedAt }) };
    } catch {
      // Fall through to the queue.
    }
  }
  await deps.enqueue({
    ...input,
    id: deps.newId?.() ?? crypto.randomUUID(),
    userHash: deps.userHash,
    markedAt,
    failures: 0,
  });
  return { queued: true };
}
