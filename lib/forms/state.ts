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
