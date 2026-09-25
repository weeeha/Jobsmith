import { z } from "zod";
import { KEY_PATTERN, type WireArtifact } from "./wire";
import type { IncomingArtifact } from "@/lib/artifacts/upsert";

const WIRE_SCOPES = ["opportunity", "company"] as const;

const wireArtifactSchema = z.object({
  key: z
    .string({ error: "key must be a string." })
    .regex(
      KEY_PATTERN,
      "key must be 1 to 100 lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit.",
    ),
  kind: z.string({ error: "kind must be a string." }).min(1, "kind must not be empty."),
  title: z.string({ error: "title must be a string." }).nullable().optional(),
  scope: z.enum(WIRE_SCOPES, { error: "scope must be opportunity or company." }).optional(),
  stage: z.string({ error: "stage must be a string." }).nullable().optional(),
  body_md: z
    .string({ error: "body_md must be a string." })
    .refine((v) => v.trim().length > 0, "body_md must not be empty."),
});

export const pushBodySchema: z.ZodType<{ artifacts: WireArtifact[] }> = z.object(
  {
    artifacts: z
      .array(wireArtifactSchema, { error: "artifacts must be a list." })
      .min(1, "artifacts must hold at least one document."),
  },
  { error: "The body must be a JSON object." },
);

export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]!;
  const path = issue.path.join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}

export function toIncoming(artifact: WireArtifact): IncomingArtifact {
  return {
    key: artifact.key,
    kind: artifact.kind,
    title: artifact.title ?? null,
    scope: artifact.scope ?? "opportunity",
    stage: artifact.stage ? { ref: artifact.stage } : null,
    bodyMd: artifact.body_md,
  };
}
