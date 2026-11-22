import { authenticate, type BridgeDeps } from "./auth";
import { bridgeError, bridgeJson } from "./http";
import { logBridgeError } from "./log";
import {
  EVENTS_LOOKBACK_DEFAULT_HOURS,
  EVENTS_LOOKBACK_MAX_DAYS,
  EVENTS_PAGE_DEFAULT,
  EVENTS_PAGE_MAX,
  type WireEvent,
  type WireEventsResponse,
} from "./wire";
import { fail, ok, type Result } from "@/lib/result";
import type { Scoped } from "@/lib/db/scoped";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Opaque to clients: base64url of "<ISO created time>|<event id>".
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(value: string): { createdAt: Date; id: string } | null {
  if (value === "" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const text = Buffer.from(value, "base64url").toString("utf8");
  const sep = text.indexOf("|");
  if (sep < 0) return null;
  const iso = text.slice(0, sep);
  const id = text.slice(sep + 1);
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso) return null;
  if (!UUID.test(id)) return null;
  return { createdAt, id };
}

export async function listEvents(
  s: Scoped,
  input: { after: string | null; limit: number; now: Date },
): Promise<Result<{ events: WireEvent[]; next: string | null }, "invalid_cursor">> {
  const floor = input.now.getTime() - EVENTS_LOOKBACK_MAX_DAYS * DAY_MS;
  let since: Date;
  let after: { createdAt: Date; id: string } | null = null;
  if (input.after !== null) {
    after = decodeCursor(input.after);
    if (after === null) return fail("invalid_cursor", "The cursor is not one this endpoint returned.");
    since = new Date(Math.max(after.createdAt.getTime(), floor));
  } else {
    since = new Date(input.now.getTime() - EVENTS_LOOKBACK_DEFAULT_HOURS * HOUR_MS);
  }

  const rows = await s.event.listFeed({ since, after, limit: input.limit });
  const events: WireEvent[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    slug: r.slug,
    stage: r.stageLabel,
    occurred_at: r.occurredAt.toISOString(),
    created_at: r.createdAt.toISOString(),
    body: r.body === null || r.body === "" ? null : r.body,
    meta: (r.meta ?? {}) as Record<string, unknown>,
  }));
  const last = rows[rows.length - 1];
  const next = last ? encodeCursor(last.createdAt, last.id) : input.after;
  return ok({ events, next });
}

export async function handleListEvents(deps: BridgeDeps, request: Request): Promise<Response> {
  const requestId = deps.requestId();
  try {
    const now = deps.now();
    const auth = await authenticate(deps, request, requestId, now);
    if (!auth.ok) return auth.response;

    const params = new URL(request.url).searchParams;
    const limitParam = params.get("limit");
    let limit = EVENTS_PAGE_DEFAULT;
    if (limitParam !== null && limitParam !== "") {
      limit = /^\d{1,6}$/.test(limitParam) ? Number(limitParam) : 0;
      if (limit < 1 || limit > EVENTS_PAGE_MAX) {
        return bridgeError("invalid_query", requestId, { text: `limit must be a whole number from 1 to ${EVENTS_PAGE_MAX}.` });
      }
    }
    const afterParam = params.get("after");
    const after = afterParam === null || afterParam === "" ? null : afterParam;

    const result = await listEvents(auth.s, { after, limit, now });
    if (!result.ok) {
      return bridgeError("invalid_query", requestId, { text: "after is not a cursor this endpoint returned." });
    }
    const body: WireEventsResponse = { events: result.data.events, next: result.data.next, requestId };
    return bridgeJson(body, { requestId });
  } catch (error) {
    logBridgeError(requestId, error);
    return bridgeError("server_error", requestId);
  }
}
