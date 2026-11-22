import { z } from "zod";
import type { ToolDefinition } from "../registry";
import { loadFitProfile } from "@/lib/fit/profile";
import { getProfile as readProfile } from "@/lib/profile";
import { preferencesSummaryLines } from "@/lib/preferences/summary";

const input = z.object({ include_resume: z.boolean().default(false) });

const output = z.object({
  headline: z.string().nullable(),
  timezone: z.string(),
  preferences: z.record(z.string(), z.unknown()),
  preferences_summary: z.array(z.string()),
  resume_chars: z.number().int(),
  resume_md: z.string().optional(),
});

export const getProfile: ToolDefinition<typeof input, typeof output> = {
  name: "get_profile",
  title: "Get profile",
  description: "Get the user's headline, time zone and preferences. Pass include_resume to also get the resume text.",
  input,
  output,
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler(ctx, args) {
    const [profile, fit] = await Promise.all([readProfile(ctx.s), loadFitProfile(ctx.s)]);
    const resume = profile.resumeMd ?? "";
    return {
      ok: true,
      structured: {
        headline: profile.headline,
        timezone: profile.timezone,
        preferences: fit.preferences as unknown as Record<string, unknown>,
        preferences_summary: preferencesSummaryLines(fit.preferences),
        resume_chars: resume.length,
        ...(args.include_resume ? { resume_md: resume } : {}),
      },
    };
  },
};
