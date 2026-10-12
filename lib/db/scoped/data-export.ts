import { asc, eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";

// The reads behind "Export my data". Every select names its columns, and the
// list is the export: nothing is ever read with `select()` and no column list
// here, so a column added to a table later (or a secret such as the API token
// hash) never reaches the file until someone adds it on purpose. Excluded on
// purpose: every user_id, derived values (name_key, dedupe_hash, content_hash,
// source_hash) and the token hash with its rate-limit counters.
const userColumns = {
  id: schema.user.id,
  name: schema.user.name,
  email: schema.user.email,
  createdAt: schema.user.createdAt,
};

const companyColumns = {
  id: schema.company.id,
  name: schema.company.name,
  domain: schema.company.domain,
  careersUrl: schema.company.careersUrl,
  atsKind: schema.company.atsKind,
  atsOrg: schema.company.atsOrg,
  size: schema.company.size,
  industry: schema.company.industry,
  hq: schema.company.hq,
  notesMd: schema.company.notesMd,
  tracked: schema.company.tracked,
  createdAt: schema.company.createdAt,
  updatedAt: schema.company.updatedAt,
};

const opportunityColumns = {
  id: schema.opportunity.id,
  companyId: schema.opportunity.companyId,
  slug: schema.opportunity.slug,
  roleTitle: schema.opportunity.roleTitle,
  location: schema.opportunity.location,
  workMode: schema.opportunity.workMode,
  source: schema.opportunity.source,
  sourceUrl: schema.opportunity.sourceUrl,
  postingMd: schema.opportunity.postingMd,
  postingCapturedAt: schema.opportunity.postingCapturedAt,
  compMin: schema.opportunity.compMin,
  compMax: schema.opportunity.compMax,
  compCurrency: schema.opportunity.compCurrency,
  compNote: schema.opportunity.compNote,
  myAsk: schema.opportunity.myAsk,
  fitScore: schema.opportunity.fitScore,
  fit: schema.opportunity.fit,
  fitStatus: schema.opportunity.fitStatus,
  needsReview: schema.opportunity.needsReview,
  currentStageId: schema.opportunity.currentStageId,
  status: schema.opportunity.status,
  closedReason: schema.opportunity.closedReason,
  closedAt: schema.opportunity.closedAt,
  closedStageId: schema.opportunity.closedStageId,
  nextAction: schema.opportunity.nextAction,
  nextActionAt: schema.opportunity.nextActionAt,
  createdAt: schema.opportunity.createdAt,
  updatedAt: schema.opportunity.updatedAt,
};

const stageColumns = {
  id: schema.stage.id,
  opportunityId: schema.stage.opportunityId,
  kind: schema.stage.kind,
  label: schema.stage.label,
  position: schema.stage.position,
  status: schema.stage.status,
  scheduledAt: schema.stage.scheduledAt,
  format: schema.stage.format,
  enteredAt: schema.stage.enteredAt,
  completedAt: schema.stage.completedAt,
  outcomeMd: schema.stage.outcomeMd,
  createdAt: schema.stage.createdAt,
  updatedAt: schema.stage.updatedAt,
};

const personColumns = {
  id: schema.person.id,
  companyId: schema.person.companyId,
  name: schema.person.name,
  title: schema.person.title,
  linkedinUrl: schema.person.linkedinUrl,
  email: schema.person.email,
  notesMd: schema.person.notesMd,
  createdAt: schema.person.createdAt,
  updatedAt: schema.person.updatedAt,
};

const opportunityPersonColumns = {
  id: schema.opportunityPerson.id,
  opportunityId: schema.opportunityPerson.opportunityId,
  personId: schema.opportunityPerson.personId,
  role: schema.opportunityPerson.role,
  stageId: schema.opportunityPerson.stageId,
  createdAt: schema.opportunityPerson.createdAt,
  updatedAt: schema.opportunityPerson.updatedAt,
};

const eventColumns = {
  id: schema.event.id,
  opportunityId: schema.event.opportunityId,
  stageId: schema.event.stageId,
  kind: schema.event.kind,
  body: schema.event.body,
  meta: schema.event.meta,
  occurredAt: schema.event.occurredAt,
  createdAt: schema.event.createdAt,
};

const artifactColumns = {
  id: schema.artifact.id,
  opportunityId: schema.artifact.opportunityId,
  companyId: schema.artifact.companyId,
  stageId: schema.artifact.stageId,
  key: schema.artifact.key,
  version: schema.artifact.version,
  kind: schema.artifact.kind,
  title: schema.artifact.title,
  bodyMd: schema.artifact.bodyMd,
  origin: schema.artifact.origin,
  editedAt: schema.artifact.editedAt,
  sentAt: schema.artifact.sentAt,
  createdAt: schema.artifact.createdAt,
  updatedAt: schema.artifact.updatedAt,
};

const apiTokenColumns = {
  id: schema.apiToken.id,
  name: schema.apiToken.name,
  prefix: schema.apiToken.prefix,
  lastUsedAt: schema.apiToken.lastUsedAt,
  revokedAt: schema.apiToken.revokedAt,
  createdAt: schema.apiToken.createdAt,
};

export function dataExportQueries(db: Db, userId: string) {
  return {
    async user() {
      const [row] = await db.select(userColumns).from(schema.user).where(eq(schema.user.id, userId));
      return row ?? null;
    },
    async companies() {
      return db
        .select(companyColumns)
        .from(schema.company)
        .where(eq(schema.company.userId, userId))
        .orderBy(asc(schema.company.createdAt), asc(schema.company.id));
    },
    async opportunities() {
      return db
        .select(opportunityColumns)
        .from(schema.opportunity)
        .where(eq(schema.opportunity.userId, userId))
        .orderBy(asc(schema.opportunity.createdAt), asc(schema.opportunity.id));
    },
    async stages() {
      return db
        .select(stageColumns)
        .from(schema.stage)
        .where(eq(schema.stage.userId, userId))
        .orderBy(asc(schema.stage.createdAt), asc(schema.stage.id));
    },
    async people() {
      return db
        .select(personColumns)
        .from(schema.person)
        .where(eq(schema.person.userId, userId))
        .orderBy(asc(schema.person.createdAt), asc(schema.person.id));
    },
    async opportunityPeople() {
      return db
        .select(opportunityPersonColumns)
        .from(schema.opportunityPerson)
        .where(eq(schema.opportunityPerson.userId, userId))
        .orderBy(asc(schema.opportunityPerson.createdAt), asc(schema.opportunityPerson.id));
    },
    async events() {
      return db
        .select(eventColumns)
        .from(schema.event)
        .where(eq(schema.event.userId, userId))
        .orderBy(asc(schema.event.createdAt), asc(schema.event.id));
    },
    async artifacts() {
      return db
        .select(artifactColumns)
        .from(schema.artifact)
        .where(eq(schema.artifact.userId, userId))
        .orderBy(asc(schema.artifact.createdAt), asc(schema.artifact.id));
    },
    async apiTokens() {
      return db
        .select(apiTokenColumns)
        .from(schema.apiToken)
        .where(eq(schema.apiToken.userId, userId))
        .orderBy(asc(schema.apiToken.createdAt), asc(schema.apiToken.id));
    },
  };
}

type Queries = ReturnType<typeof dataExportQueries>;
type RowOf<K extends keyof Queries> = Awaited<ReturnType<Queries[K]>> extends (infer Row)[] ? Row : never;

export type ExportCompany = RowOf<"companies">;
export type ExportOpportunity = RowOf<"opportunities">;
export type ExportStage = RowOf<"stages">;
export type ExportPerson = RowOf<"people">;
export type ExportOpportunityPerson = RowOf<"opportunityPeople">;
export type ExportEvent = RowOf<"events">;
export type ExportArtifact = RowOf<"artifacts">;
export type ExportApiToken = RowOf<"apiTokens">;
