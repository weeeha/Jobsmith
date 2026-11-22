import { z } from "zod";
import type { ToolDefinition } from "../registry";
import { STAGE_KIND_VALUES } from "@/lib/pipeline/values";

const input = z.object({
  status: z.enum(["active", "closed", "all"]).default("active"),
  stage_kind: z.enum(STAGE_KIND_VALUES).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

const output = z.object({
  jobs: z.array(
    z.object({
      slug: z.string(),
      company: z.string(),
      role: z.string(),
      status: z.string(),
      stage: z.object({ kind: z.string(), label: z.string() }),
      fit_score: z.number().nullable(),
      next_action: z.string().nullable(),
      next_action_at: z.string().nullable(),
      updated_at: z.string(),
    }),
  ),
});

export const listJobs: ToolDefinition<typeof input, typeof output> = {
  name: "list_jobs",
  title: "List jobs",
  description: "List the user's jobs with company, role, stage, fit score and next action. Use it to find a slug.",
  input,
  output,
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler(ctx, args) {
    const summaries = await ctx.s.opportunity.listSummaries(args.status);
    const jobs = summaries
      .filter((j) => args.stage_kind === undefined || j.stage.kind === args.stage_kind)
      .slice(0, args.limit)
      .map((j) => ({
        slug: j.slug,
        company: j.companyName,
        role: j.roleTitle,
        status: j.status,
        stage: { kind: j.stage.kind, label: j.stage.label },
        fit_score: j.fitScore,
        next_action: j.nextAction,
        next_action_at: j.nextActionAt ? j.nextActionAt.toISOString() : null,
        updated_at: j.updatedAt.toISOString(),
      }));
    return { ok: true, structured: { jobs } };
  },
};
