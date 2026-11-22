// Expected refusals reach the model as a tool result with isError, carrying the
// Result code and its one-sentence message unchanged. Anything else is a bug and
// reaches the model as server_error with the request id only.
export const EXPECTED_CODES = [
  "not_found",
  "invalid",
  "job_closed",
  "request_limit",
  "path_busy",
  "suspended",
  "quota_storage",
] as const;

export function failureFromResult(result: { code: string; message: string }): { ok: false; code: string; message: string } {
  return { ok: false, code: result.code, message: result.message };
}

export function internalFailure(requestId: string): { ok: false; code: "server_error"; message: string } {
  return { ok: false, code: "server_error", message: `Something went wrong on the server. Request id ${requestId}.` };
}
