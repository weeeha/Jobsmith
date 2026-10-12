import type { z } from "zod";

export type FormState =
  | { ok: true }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string>; href?: string }
  | undefined;

export type FormStateWith<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string>; href?: string }
  | undefined;

/** First message per top-level field; a later issue on the same field is dropped. */
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || key in fieldErrors) continue;
    fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * First message per field, keyed by the full dotted path ("companySize.max",
 * "attention.followUpDays"). Array indices are dropped, so every bad entry of
 * a list reports under the list's own name ("titles"), which is the name of
 * the field the form shows the message under.
 */
export function fieldErrorsByPath(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.filter((segment) => typeof segment === "string").join(".");
    if (key === "" || key in fieldErrors) continue;
    fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
