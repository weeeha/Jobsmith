import { z } from "zod";
import { canonicalTimeZone } from "@/lib/time/zone";

export const HEADLINE_MAX = 200;
export const RESUME_MAX = 50_000;

function textOrEmpty(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export function readProfileForm(formData: FormData): Record<string, unknown> {
  return {
    headline: textOrEmpty(formData.get("headline")),
    resumeMd: textOrEmpty(formData.get("resumeMd")),
    timezone: textOrEmpty(formData.get("timezone")),
  };
}

const blankToNull = (value: string): string | null => (value.trim() === "" ? null : value);

export const profileFormSchema = z.object({
  headline: z
    .string()
    .trim()
    .max(HEADLINE_MAX, "Keep the headline under 200 characters.")
    .transform((value) => (value === "" ? null : value)),
  // Line endings are normalized before the length check so a pasted CRLF
  // resume counts the same as an LF one. The text is otherwise kept as typed.
  resumeMd: z
    .string()
    .transform((value) => value.replace(/\r\n|\r/g, "\n"))
    .pipe(z.string().max(RESUME_MAX, "Keep the resume under 50,000 characters.").transform(blankToNull)),
  timezone: z
    .string()
    .trim()
    .refine((value) => canonicalTimeZone(value) !== null, "Choose a time zone from the list.")
    .transform((value) => canonicalTimeZone(value) as string),
});
export type ProfileInput = z.output<typeof profileFormSchema>;
