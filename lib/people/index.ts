import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { PERSON_ROLES, type PersonRole } from "@/lib/pipeline/values";

export const personInputSchema = z.object({
  name: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  linkedinUrl: z.url({ protocol: /^https?$/ }).optional(),
  email: z.email().optional(),
  notesMd: z.string().optional(),
  role: z.enum(PERSON_ROLES),
  stageId: z.uuid().nullable().optional(),
});

export type PersonInput = {
  name: string;
  title?: string;
  linkedinUrl?: string;
  email?: string;
  notesMd?: string;
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
