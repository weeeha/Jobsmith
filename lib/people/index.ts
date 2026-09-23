import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { PERSON_ROLES, type PersonRole } from "@/lib/pipeline/values";

// The person dialog has no separate "clear" control either, same reasoning
// as updateOpportunityDetailsSchema - title, linkedinUrl, email and
// notesMd are nullable, not just optional, so a blanked field actually
// clears the column on an edit instead of being silently ignored.
// `undefined` still means "leave unchanged" on an edit (the key is simply
// absent) and "not set" on an add; `null` means "clear it" on an edit and
// "not set" too on an add (addPersonToOpportunity has no previous value to
// leave alone). name and role stay required; stageId already accepted null.
export const personInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name."),
  title: z.string().trim().min(1, "Enter a title.").nullable().optional(),
  linkedinUrl: z
    .url({ protocol: /^https?$/, error: "Enter a link that starts with http or https." })
    .nullable()
    .optional(),
  email: z.email({ error: "Enter a real email address." }).nullable().optional(),
  notesMd: z.string().nullable().optional(),
  role: z.enum(PERSON_ROLES, { error: "Choose a role." }),
  stageId: z.uuid({ error: "Choose a valid stage." }).nullable().optional(),
});

export type PersonInput = {
  name: string;
  title?: string | null;
  linkedinUrl?: string | null;
  email?: string | null;
  notesMd?: string | null;
  role: PersonRole;
  stageId?: string | null;
};

async function checkStageBelongs(
  s: Scoped,
  opportunityId: string,
  stageId: string | null | undefined,
): Promise<boolean> {
  if (stageId === undefined || stageId === null) {
    return true;
  }
  const stages = await s.stage.listForOpportunity(opportunityId);
  return stages.some((st) => st.id === stageId);
}

export async function addPersonToOpportunity(
  s: Scoped,
  opportunityId: string,
  input: PersonInput,
): Promise<Result<{ linkId: string; personId: string }, "not_found" | "invalid">> {
  const parsed = personInputSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid", parsed.error.issues[0]?.message ?? "That is not valid.");
  }

  const opportunity = await s.opportunity.getById(opportunityId);
  if (!opportunity) {
    return fail("not_found", "This job no longer exists.");
  }

  if (!(await checkStageBelongs(s, opportunityId, parsed.data.stageId))) {
    return fail("invalid", "That stage does not belong to this job.");
  }

  const person = await s.person.insert({
    companyId: opportunity.companyId,
    name: parsed.data.name,
    title: parsed.data.title,
    linkedinUrl: parsed.data.linkedinUrl,
    email: parsed.data.email,
    notesMd: parsed.data.notesMd,
  });

  const link = await s.opportunityPerson.link({
    opportunityId,
    personId: person.id,
    role: parsed.data.role,
    stageId: parsed.data.stageId ?? null,
  });

  return ok({ linkId: link.id, personId: person.id });
}

export async function updateLinkedPerson(
  s: Scoped,
  opportunityId: string,
  linkId: string,
  input: PersonInput,
): Promise<Result<null, "not_found" | "invalid">> {
  const parsed = personInputSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid", parsed.error.issues[0]?.message ?? "That is not valid.");
  }

  const links = await s.opportunityPerson.listForOpportunity(opportunityId);
  const link = links.find((l) => l.linkId === linkId);
  if (!link) {
    return fail("not_found", "This person is no longer linked to this job.");
  }

  if (!(await checkStageBelongs(s, opportunityId, parsed.data.stageId))) {
    return fail("invalid", "That stage does not belong to this job.");
  }

  await s.person.update(link.person.id, {
    name: parsed.data.name,
    title: parsed.data.title,
    linkedinUrl: parsed.data.linkedinUrl,
    email: parsed.data.email,
    notesMd: parsed.data.notesMd,
  });
  await s.opportunityPerson.update(linkId, { role: parsed.data.role, stageId: parsed.data.stageId ?? null });

  return ok(null);
}

export async function unlinkPerson(
  s: Scoped,
  opportunityId: string,
  linkId: string,
): Promise<Result<null, "not_found">> {
  const links = await s.opportunityPerson.listForOpportunity(opportunityId);
  const link = links.find((l) => l.linkId === linkId);
  if (!link) {
    return fail("not_found", "This person is no longer linked to this job.");
  }

  await s.opportunityPerson.unlink(linkId);
  return ok(null);
}
