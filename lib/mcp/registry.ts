import type { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import type { BridgeDeps } from "@/lib/bridge/auth";
import { TOOLS } from "./tools";

export type ToolContext = { s: Scoped; deps: BridgeDeps; requestId: string; now: Date };

export type ToolOutcome =
  | { ok: true; structured?: object; text?: string; links?: { uri: string; name: string; mimeType: string }[] }
  | { ok: false; code: string; message: string };

export type ToolDefinition<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> = {
  name: string;
  title: string;
  description: string;
  input: I;
  output: O | null;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: false };
  handler(ctx: ToolContext, args: z.infer<I>): Promise<ToolOutcome>;
};

// The twelve tool names of the Contract. A tool outside this list is a bug.
export const ALLOWED_TOOL_NAMES: readonly string[] = [
  "list_jobs",
  "get_job",
  "get_job_context",
  "list_documents",
  "read_document",
  "write_document",
  "get_profile",
  "get_prep",
  "list_requests",
  "create_request",
  "cancel_request",
  "list_feed_items",
];

// Names left out because a "Before starting" check of milestone 30 did not print
// on this branch:
// - get_prep: lib/prep/parse.ts does not exist (no prep-ok).
// - list_documents, read_document: no document read route under app/api/bridge
//   (no document-routes-ok).
// - list_feed_items: lib/notify/write.ts and lib/feed/items.ts do not exist
//   (no feed-ok); Task 11 adds it when Feed exists.
export const SKIPPED_TOOLS: readonly string[] = ["get_prep", "list_documents", "read_document", "list_feed_items"];

export function toolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}
