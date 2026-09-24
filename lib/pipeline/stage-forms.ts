import { z } from "zod";
import { STAGE_FORMATS } from "@/lib/pipeline/values";
import { messageFor } from "@/lib/pipeline/messages";

// The four kinds the job page's "Add a stage" section offers - Saved,
// Applied and Offer exist exactly once per job (planAddStage's own
// fixed_stage rule) and are never offered here. A plain tuple, not derived
// from STAGE_KINDS: these schemas live outside the "use server" actions
// file only so they can be exported (a "use server" file may only export
// async functions) and imported both there and from tests.
export const ADDABLE_STAGE_KINDS = ["recruiter_screen", "hiring_manager", "portfolio_case", "panel_final"] as const;

export const renameStageFormSchema = z.object({
  label: z.string().trim().min(1, messageFor("label_required")),
});

export const addStageFormSchema = z.object({
  kind: z.enum(ADDABLE_STAGE_KINDS, { error: "Choose a stage kind." }),
  label: z.string().trim().min(1, messageFor("label_required")),
});

export const stageDetailFormSchema = z.object({
  scheduledAt: z.string(),
  format: z.enum([...STAGE_FORMATS, ""], { error: "Choose a format." }),
  outcomeMd: z.string(),
});
