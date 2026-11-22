import { z } from "zod";
import type { ToolDefinition } from "../registry";
import { SLUG_PATTERN } from "@/lib/bridge/wire";
import { loadJobJson } from "@/lib/bridge/job-json";

const input = z.object({ slug: z.string().regex(SLUG_PATTERN, "slug must be letters, digits and hyphens.") });
const output = z.object({ schema: z.literal("job/v1") }).passthrough();

export const getJob: ToolDefinition<typeof input, typeof output> = {
  name: "get_job",
  title: "Get a job",
  description:
    "Get one job as structured data: company, stages, people, fit, documents, prep counts and open requests. The posting text is in the context document.",
  input,
  output,
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler(ctx, args) {
    const job = await loadJobJson(ctx.s, args.slug, ctx.now);
    if (job === null) return { ok: false, code: "not_found", message: `No job with the slug ${args.slug}.` };
    return { ok: true, structured: job };
  },
};
