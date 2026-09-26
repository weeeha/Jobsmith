import { z } from "zod";
import { htmlToMarkdown } from "@/lib/intake/html";
import { titleFromSlug, workModeFromText, type AtsRef } from "./match";
import type { AtsPosting } from "./match";

export type { AtsPosting } from "./match";

const nonEmpty = z.string().trim().min(1);

export const ashbyResponseSchema = z.object({
  data: z.object({
    jobPosting: z
      .object({
        title: nonEmpty,
        descriptionHtml: z.string().nullish(),
        locationName: z.string().nullish(),
        organization: z.object({ name: z.string().nullish() }).nullish(),
      })
      .nullable(),
  }),
});

export function mapAshby(ref: AtsRef, json: unknown): AtsPosting | null {
  const parsed = ashbyResponseSchema.safeParse(json);
  if (!parsed.success || !parsed.data.data.jobPosting) return null;
  const p = parsed.data.data.jobPosting;
  const company = p.organization?.name?.trim();
  const location = p.locationName?.trim() || null;
  return {
    companyName: company || titleFromSlug(ref.org),
    companyFromSlug: !company,
    roleTitle: p.title,
    location,
    workMode: workModeFromText(location),
    bodyMd: htmlToMarkdown(p.descriptionHtml ?? ""),
  };
}
