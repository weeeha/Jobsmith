import type { MoveError } from "@/lib/pipeline/rules";

export type AddedJob = { slug: string; roleTitle: string; companyName: string; note: "none" | "review" | "link_only" };

export type AddJobFailureCode = "invalid" | "needs_text" | "needs_details" | "duplicate" | "server_error" | MoveError;

export type AddJobState =
  | undefined
  | { ok: true; data: AddedJob }
  | { ok: false; code: AddJobFailureCode; message: string; fieldErrors?: Record<string, string>; href?: string; draft?: string };

// The state's own draft, unless it equals the one the caller says was just
// dropped (the dialog clears the hidden draft field as soon as the user
// edits "Link to the posting" or "Posting text"), in which case
// there is nothing left to echo.
export function draftFor(state: AddJobState, dropped: string | null): string {
  if (!state || state.ok || !state.draft) return "";
  return state.draft === dropped ? "" : state.draft;
}
