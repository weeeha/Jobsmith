export type BridgeErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "not_found"
  | "invalid_query"
  | "invalid_json"
  | "invalid_payload"
  | "duplicate_key"
  | "payload_too_large"
  | "too_many_artifacts"
  | "artifact_too_large"
  | "server_error";

// text carries the already-composed message for the two codes whose wording
// depends on which endpoint raised them (invalid_query: a list-only or a
// push-only sentence; invalid_payload: whatever firstIssue produced for this
// request), so BRIDGE_ERRORS itself does not need to know which endpoint is
// calling it.
export type BridgeErrorDetail = { slug?: string; key?: string; seconds?: number; text?: string };

export const BRIDGE_ERRORS: Record<
  BridgeErrorCode,
  { status: 400 | 401 | 404 | 413 | 429 | 500; message(detail: BridgeErrorDetail & { requestId: string }): string }
> = {
  unauthorized: {
    status: 401,
    message: () => "Missing, unknown or revoked token.",
  },
  rate_limited: {
    status: 429,
    message: (d) => `Too many requests. Try again in ${d.seconds} seconds.`,
  },
  not_found: {
    status: 404,
    message: (d) => `No job with the slug ${d.slug}.`,
  },
  invalid_query: {
    status: 400,
    message: (d) => d.text ?? "",
  },
  invalid_json: {
    status: 400,
    message: () => "The request body is not valid JSON.",
  },
  invalid_payload: {
    status: 400,
    message: (d) => d.text ?? "",
  },
  duplicate_key: {
    status: 400,
    message: (d) => `The key ${d.key} appears more than once in this push.`,
  },
  payload_too_large: {
    status: 413,
    message: () => "The request is larger than 4 MB. Push fewer files at a time.",
  },
  too_many_artifacts: {
    status: 413,
    message: () => "A push holds at most 50 documents.",
  },
  artifact_too_large: {
    status: 413,
    message: (d) => `${d.key} is larger than 1 MB.`,
  },
  server_error: {
    status: 500,
    message: (d) => `Something went wrong on the server. Request id ${d.requestId}.`,
  },
};
