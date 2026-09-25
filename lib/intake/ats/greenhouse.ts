import { z } from "zod";
import { htmlToMarkdown, decodeIfEncoded } from "@/lib/intake/html";
import { titleFromSlug, workModeFromText, type AtsRef } from "./match";
import type { AtsPosting } from "./match";

export type { AtsPosting } from "./match";

const nonEmpty = z.string().trim().min(1);

export const greenhouseJobSchema = z.object({
  title: nonEmpty,
  content: z.string().default(""),
  location: z.object({ name: z.string().nullish() }).nullish(),
  company_name: z.string().nullish(),
  absolute_url: z.string().nullish(),
});

export function mapGreenhouse(ref: AtsRef, json: unknown): AtsPosting | null {
  const parsed = greenhouseJobSchema.safeParse(json);
  if (!parsed.success) return null;
  const job = parsed.data;
  const company = job.company_name?.trim();
  const location = job.location?.name?.trim() || null;
  return {
    companyName: company || titleFromSlug(ref.org),
    companyFromSlug: !company,
    roleTitle: job.title,
    location,
    workMode: workModeFromText(location),
    bodyMd: htmlToMarkdown(decodeIfEncoded(job.content)),
  };
}
