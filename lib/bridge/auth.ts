import { parseBearer, bridgeError } from "./http";
import { RATE_LIMIT_PER_MINUTE } from "./wire";
import { authenticateBearer } from "@/lib/auth/api-token";
import { scoped, type Scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";

export type BridgeDeps = { db: Db; now(): Date; revalidate(path: string): void; requestId(): string; appUrl?: string };

export type AuthResult = { ok: true; userId: string; s: Scoped } | { ok: false; response: Response };

// Shared by every bridge handler and the MCP endpoint. Never reads the
// `cookie` header: that omission, not a check that rejects it, is what keeps
// a session-looking cookie from ever authenticating a bridge request.
export async function authenticate(deps: BridgeDeps, request: Request, requestId: string, now: Date): Promise<AuthResult> {
  const token = parseBearer(request.headers.get("authorization"));
  if (token === null) {
    return { ok: false, response: bridgeError("unauthorized", requestId) };
  }
  const auth = await authenticateBearer(deps.db, token, now);
  if (auth === null) {
    return { ok: false, response: bridgeError("unauthorized", requestId) };
  }
  if (auth.count > RATE_LIMIT_PER_MINUTE) {
    const windowEndMs = auth.windowStart.getTime() + 60_000;
    const secondsLeft = Math.max(1, Math.ceil((windowEndMs - now.getTime()) / 1000));
    return {
      ok: false,
      response: bridgeError("rate_limited", requestId, { seconds: secondsLeft }, { "Retry-After": String(secondsLeft) }),
    };
  }
  return { ok: true, userId: auth.userId, s: scoped(deps.db, auth.userId) };
}
