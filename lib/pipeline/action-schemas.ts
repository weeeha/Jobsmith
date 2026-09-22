import { z } from "zod";
import { STAGE_KIND_VALUES, CLOSED_REASONS } from "@/lib/pipeline/values";

export const opportunityIdSchema = z.uuid();
export const stageIdSchema = z.uuid();
export const moveTargetSchema = z.union([
  z.object({ kind: z.enum(STAGE_KIND_VALUES) }).strict(),
  z.object({ stageId: z.uuid() }).strict(),
]);
export const closedReasonSchema = z.enum(CLOSED_REASONS);
