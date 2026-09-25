import { z } from "zod";
import { htmlToMarkdown } from "@/lib/intake/html";
import type { WorkMode } from "@/lib/pipeline/values";
import { titleFromSlug, workModeFromText, type AtsRef } from "./match";
import type { AtsPosting } from "./match";

export type { AtsPosting } from "./match";

const nonEmpty = z.string().trim().min(1);

export const leverPostingSchema = z.object({
  text: nonEmpty,
  description: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().default(""), content: z.string().default("") })).nullish(),
  additional: z.string().nullish(),
  categories: z.object({ location: z.string().nullish(), commitment: z.string().nullish() }).nullish(),
  workplaceType: z.string().nullish(),
});

export function mapLever(ref: AtsRef, json: unknown): AtsPosting | null {
  const parsed = leverPostingSchema.safeParse(json);
  if (!parsed.success) return null;
  const p = parsed.data;
  const html = [p.description ?? "", ...(p.lists ?? []).map((l) => `<h2>${l.text}</h2><ul>${l.content}</ul>`), p.additional ?? ""].join("\n");
  const location = p.categories?.location?.trim() || null;
  const wt = (p.workplaceType ?? "").toLowerCase();
  const workMode: WorkMode | null =
    wt === "remote" ? "remote" : wt === "hybrid" ? "hybrid" : wt === "onsite" || wt === "on-site" ? "onsite" : workModeFromText(location);
  return {
    companyName: titleFromSlug(ref.org),
    companyFromSlug: true,
    roleTitle: p.text,
    location,
    workMode,
    bodyMd: htmlToMarkdown(html),
  };
}
