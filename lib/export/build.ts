import { DrizzleQueryError } from "drizzle-orm";
import type {
  ExportApiToken,
  ExportArtifact,
  ExportCompany,
  ExportEvent,
  ExportOpportunity,
  ExportOpportunityPerson,
  ExportPerson,
  ExportStage,
} from "@/lib/db/scoped/data-export";
import type { Scoped } from "@/lib/db/scoped";
import { zonedDateKey } from "@/lib/time/zone";

export const EXPORT_FORMAT = "jobsmith-export/v1";

export type ExportDocument = {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  user: { id: string; name: string; email: string; createdAt: Date } | null;
  // preferences is the stored jsonb as it is, so an export shows what is in
  // the database even when it no longer parses.
  profile: {
    headline: string | null;
    resumeMd: string | null;
    timezone: string;
    preferences: unknown;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  companies: ExportCompany[];
  opportunities: ExportOpportunity[];
  stages: ExportStage[];
  people: ExportPerson[];
  opportunityPeople: ExportOpportunityPerson[];
  events: ExportEvent[];
  artifacts: ExportArtifact[];
  apiTokens: ExportApiToken[];
};

/**
 * Everything the user owns, in one envelope. Secrets and derived hashes are
 * not selected at all. The reads run one after another: this is a one-off
 * download, and when one read fails no other query is left running behind it.
 */
export async function buildExport(s: Scoped, now: Date): Promise<ExportDocument> {
  const user = await s.dataExport.user();
  const profile = await s.profile.get();
  const companies = await s.dataExport.companies();
  const opportunities = await s.dataExport.opportunities();
  const stages = await s.dataExport.stages();
  const people = await s.dataExport.people();
  const opportunityPeople = await s.dataExport.opportunityPeople();
  const events = await s.dataExport.events();
  const artifacts = await s.dataExport.artifacts();
  const apiTokens = await s.dataExport.apiTokens();

  return {
    format: EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    user,
    profile: profile
      ? {
          headline: profile.headline,
          resumeMd: profile.resumeMd,
          timezone: profile.timezone,
          preferences: profile.preferences,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        }
      : null,
    companies,
    opportunities,
    stages,
    people,
    opportunityPeople,
    events,
    artifacts,
    apiTokens,
  };
}

/** "jobsmith-export-2026-10-11.json", dated in the zone the user reads times in. */
export function exportFileName(now: Date, timeZone: string): string {
  return `jobsmith-export-${zonedDateKey(now, timeZone)}.json`;
}

// The request id, the error's constructor name, and for a database error the
// Postgres code and constraint. Never the message: Drizzle's carries the SQL
// and every bound parameter, which here would be the user's resume and notes.
export function logExportError(requestId: string, error: unknown): void {
  const name = error instanceof Error ? error.constructor.name : "UnknownError";
  if (error instanceof DrizzleQueryError) {
    const cause = error.cause as { code?: string; constraint?: string } | undefined;
    console.error("[export]", JSON.stringify({ requestId, error: name, code: cause?.code, constraint: cause?.constraint }));
    return;
  }
  console.error("[export]", JSON.stringify({ requestId, error: name }));
}
