import { z } from "zod";
import { ARTIFACT_KIND_VALUES, type ArtifactKind, type ArtifactTab } from "./kinds";
import { ARTIFACT_SCOPES, type ArtifactScope } from "./values";
import { utf8Bytes } from "./normalize";
import { KEY_PATTERN, MAX_ARTIFACT_BYTES } from "@/lib/bridge/wire";
import type { PasteTarget } from "./paste";

export const pasteTargetSchema: z.ZodType<PasteTarget> = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("new") }),
  z.object({
    mode: z.literal("version"),
    scope: z.enum(ARTIFACT_SCOPES),
    key: z.string().regex(KEY_PATTERN, "That is not a valid document target."),
  }),
]);

export const pasteFormSchema: z.ZodType<{ title: string; kind: ArtifactKind; stageId: string | null; bodyMd: string }> = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the document a title.")
    .max(200, "Keep the title to 200 characters or fewer."),
  kind: z.enum(ARTIFACT_KIND_VALUES, { error: "Choose a kind." }),
  stageId: z
    .string()
    .transform((v) => (v.trim() === "" ? null : v))
    .pipe(z.uuid({ error: "Choose a stage from the list." }).nullable()),
  bodyMd: z
    .string()
    .refine((v) => v.trim().length > 0, "Paste some markdown.")
    .refine((v) => utf8Bytes(v) <= MAX_ARTIFACT_BYTES, "Keep the markdown under 1 MB."),
});

export const editFormSchema: z.ZodType<{ bodyMd: string }> = z.object({
  bodyMd: z
    .string()
    .refine((v) => v.trim().length > 0, "The document cannot be empty.")
    .refine((v) => utf8Bytes(v) <= MAX_ARTIFACT_BYTES, "Keep the markdown under 1 MB."),
});

import type { UpsertResult } from "./upsert";
import type { FormStateWith } from "@/lib/forms/state";

export type PasteFormState = FormStateWith<UpsertResult & { title: string; tab: ArtifactTab }>;
export type EditFormState = FormStateWith<{ status: "edited" | "versioned" | "unchanged"; version: number; title: string }>;
