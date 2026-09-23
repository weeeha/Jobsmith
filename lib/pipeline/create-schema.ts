import { z } from "zod";
import { WORK_MODES, OPPORTUNITY_SOURCES } from "@/lib/pipeline/values";

// Postgres's `integer` columns (comp_min, comp_max, lib/db/schema/pipeline.ts)
// top out at 2,147,483,647 - well inside a JS safe integer, so without this
// bound a bigger figure passed Zod and then made Postgres itself throw at
// insert time, turning an ordinary bad input into an unhandled error instead
// of a returned `invalid` result.
const MAX_COMP = 2_147_483_647;
const compFigureSchema = z
  .number({ error: "Enter a number." })
  .int("Enter a whole number.")
  .nonnegative("Enter a number that is zero or more.")
  .max(MAX_COMP, `Enter a number no greater than ${MAX_COMP.toLocaleString("en-US")}.`);

export const createOpportunitySchema = z
  .object({
    companyName: z.string().trim().min(1, "Enter a company name."),
    roleTitle: z.string().trim().min(1, "Enter a role."),
    location: z.string().trim().min(1, "Enter a location.").optional(),
    workMode: z.enum(WORK_MODES, { error: "Choose a work mode." }).optional(),
    sourceUrl: z.url({ protocol: /^https?$/, error: "Enter a link that starts with http or https." }).optional(),
    postingText: z.string().optional(),
    compMin: compFigureSchema.optional(),
    compMax: compFigureSchema.optional(),
    compCurrency: z.string().trim().min(1, "Enter a currency.").optional(),
    compNote: z.string().optional(),
    myAsk: z.string().optional(),
    source: z.enum(OPPORTUNITY_SOURCES).optional(),
  })
  .refine((v) => v.compMin === undefined || v.compMax === undefined || v.compMin <= v.compMax, {
    message: "Pay to must be at least pay from.",
    path: ["compMax"],
  });
