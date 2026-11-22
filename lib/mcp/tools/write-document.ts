import { z } from "zod";
import type { ToolDefinition } from "../registry";
import { SLUG_PATTERN, MAX_ARTIFACT_BYTES } from "@/lib/bridge/wire";
import { wireArtifactSchema, toIncoming } from "@/lib/bridge/push-schema";
import { applyPush } from "@/lib/bridge/push";
import { utf8Bytes } from "@/lib/artifacts/normalize";
import { failureFromResult } from "../errors";

const input = wireArtifactSchema
  .extend({
    slug: z.string().regex(SLUG_PATTERN, "slug must be letters, digits and hyphens."),
    dry_run: z.boolean().optional(),
  })
  .refine((v) => utf8Bytes(v.body_md) <= MAX_ARTIFACT_BYTES, {
    path: ["body_md"],
    message: "body_md must be 1 MiB or less.",
  });

const output = z.object({
  key: z.string(),
  scope: z.enum(["opportunity", "company"]),
  status: z.enum(["created", "versioned", "updated", "unchanged"]),
  version: z.number().int(),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
});

export const writeDocument: ToolDefinition<typeof input, typeof output> = {
  name: "write_document",
  title: "Write a document",
  description:
    "Add a version of a document under a key. A repeat with the same body changes nothing. It never deletes, never marks a document sent and never moves a stage.",
  input,
  output,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async handler(ctx, args) {
    const opportunity = await ctx.s.opportunity.getBySlug(args.slug);
    if (!opportunity) return { ok: false, code: "not_found", message: `No job with the slug ${args.slug}.` };
    const incoming = toIncoming({
      key: args.key,
      kind: args.kind,
      title: args.title,
      scope: args.scope,
      stage: args.stage,
      body_md: args.body_md,
    });
    const result = await applyPush(ctx.deps, ctx.s, {
      opportunity,
      inputs: [incoming],
      dryRun: args.dry_run ?? false,
      now: ctx.now,
    });
    if (!result.ok) return failureFromResult(result);
    const r = result.data.results[0]!;
    return {
      ok: true,
      structured: {
        key: r.key,
        scope: r.scope,
        status: r.status,
        version: r.version,
        warnings: result.data.warnings.map((w) => ({ code: w.code, message: w.message })),
      },
    };
  },
};
