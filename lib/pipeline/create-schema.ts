import { z } from "zod";
import { WORK_MODES, OPPORTUNITY_SOURCES } from "@/lib/pipeline/values";

export const createOpportunitySchema = z
  .object({
    companyName: z.string().trim().min(1),
    roleTitle: z.string().trim().min(1),
    location: z.string().trim().min(1).optional(),
    workMode: z.enum(WORK_MODES).optional(),
    sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
    postingText: z.string().optional(),
    compMin: z.number().int().nonnegative().optional(),
    compMax: z.number().int().nonnegative().optional(),
    compCurrency: z.string().trim().min(1).optional(),
    compNote: z.string().optional(),
    myAsk: z.string().optional(),
    source: z.enum(OPPORTUNITY_SOURCES).optional(),
  })
  .refine((v) => v.compMin === undefined || v.compMax === undefined || v.compMin <= v.compMax, {
    message: "compMin must be less than or equal to compMax",
    path: ["compMax"],
  });
