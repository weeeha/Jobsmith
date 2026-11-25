import { z } from "zod";
import type { WireAudioUpload } from "./wire";

const segment = z.object({
  hash: z.string({ error: "hash must be a string." }).regex(/^[0-9a-f]{16}$/, "hash must be 16 lowercase hex characters."),
  contentType: z.string({ error: "contentType must be a string." }).min(1, "contentType must not be empty.").max(100),
  durationMs: z
    .number({ error: "durationMs must be a number." })
    .int("durationMs must be a whole number.")
    .min(0, "durationMs must not be negative."),
  base64: z.string({ error: "base64 must be a string." }),
});

export const audioUploadSchema: z.ZodType<WireAudioUpload> = z.object(
  { segments: z.array(segment, { error: "segments must be a list." }).min(1, "segments must hold at least one clip.") },
  { error: "The body must be a JSON object." },
);

export function firstAudioIssue(error: z.ZodError): string {
  const issue = error.issues[0]!;
  const path = issue.path.join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}
