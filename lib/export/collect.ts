import type { Scoped } from "@/lib/db/scoped";
import { parsePreferences } from "@/lib/preferences/schema";

export const EXPORT_FORMAT = "jobsmith-export";
export const EXPORT_VERSION = 1;

export type ExportAccount = { email: string; name: string; createdAt: Date };

// userId is the same on every row of a one-user export, so it is left out.
function withoutUserId<T extends { userId: string }>(rows: T[]): Omit<T, "userId">[] {
  return rows.map(({ userId: _userId, ...rest }) => {
    void _userId;
    return rest;
  });
}

/**
 * Every row the user owns, as plain data. Never included: API token hashes
 * and rate counters, sessions, account rows (they hold the password hash) and
 * verification rows. Tokens appear only as name, prefix and dates.
 */
export async function collectExport(s: Scoped, account: ExportAccount, now: Date) {
  const [profile, companies, opportunities, stages, people, opportunityPeople, events, artifacts, apiTokens] =
    await Promise.all([
      s.profile.get(),
      s.company.list(),
      s.opportunity.listAll(),
      s.stage.listAll(),
      s.person.listAll(),
      s.opportunityPerson.listAll(),
      s.event.listAll(),
      s.artifact.listAll(),
      s.apiToken.list(),
    ]);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    account: { email: account.email, name: account.name, createdAt: account.createdAt.toISOString() },
    profile: profile
      ? {
          headline: profile.headline,
          timezone: profile.timezone,
          resumeMd: profile.resumeMd,
          preferences: parsePreferences(profile.preferences),
          updatedAt: profile.updatedAt.toISOString(),
        }
      : null,
    companies: withoutUserId(companies),
    opportunities: withoutUserId(opportunities),
    stages: withoutUserId(stages),
    people: withoutUserId(people),
    opportunityPeople: withoutUserId(opportunityPeople),
    events: withoutUserId(events),
    artifacts: withoutUserId(artifacts),
    apiTokens: apiTokens.map((t) => ({
      name: t.name,
      prefix: t.prefix,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      revokedAt: t.revokedAt,
    })),
  };
}

export type ExportDocument = Awaited<ReturnType<typeof collectExport>>;

export function exportFileName(now: Date): string {
  return `jobsmith-export-${now.toISOString().slice(0, 10)}.json`;
}
