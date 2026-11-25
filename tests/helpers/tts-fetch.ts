// An injected fetch for the TTS driver tests: records each call and answers
// from a queue. No test goes near the network.
export type RecordedCall = { url: string; method: string; headers: Record<string, string>; body: string | undefined };

export function recordingFetch(
  ...answers: Array<Response | Error | ((call: RecordedCall) => Response)>
): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    const next = answers.length > 1 ? answers.shift()! : answers[0];
    if (next === undefined) throw new Error("no answer queued");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(call) : next.clone();
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

export function bytesResponse(bytes: Uint8Array | number[], contentType: string, status = 200): Response {
  return new Response(new Uint8Array(bytes), { status, headers: { "content-type": contentType } });
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

export function timeoutError(): Error {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
}
