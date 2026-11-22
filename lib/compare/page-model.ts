import { kindInfo, type ArtifactTab } from "@/lib/artifacts/kinds";
import type { DocRef } from "@/lib/artifacts/tabs";
import { KEY_PATTERN } from "@/lib/bridge/wire";
import type { Scoped } from "@/lib/db/scoped";
import { getJobView } from "@/lib/pipeline/read";
import { loadComparison, type Comparison } from "./load";
import { parseCompareQuery, type CompareView } from "./pair";

export type CompareModel =
  | { status: "not_found" }
  | { status: "ok"; comparison: Comparison; view: CompareView | null; doc: DocRef; tab: ArtifactTab; companyId: string };

type Params = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound: CompareModel = { status: "not_found" };

/** Job route: `doc` is `job:<key>` or `company:<key>`; a company ref resolves through the job's company. */
export async function loadJobCompare(s: Scoped, slug: string, params: Params): Promise<CompareModel> {
  const q = parseCompareQuery(params);
  if (!q.doc) return notFound;
  const view = await getJobView(s, slug);
  if (!view) return notFound;
  const scope = q.doc.scope === "opportunity" ? { opportunityId: view.opportunity.id } : { companyId: view.company.id };
  const result = await loadComparison(s, scope, q.doc.key, q);
  if (!result.ok) return notFound;
  return { status: "ok", comparison: result.data, view: q.view, doc: q.doc, tab: kindInfo(result.data.a.kind).tab, companyId: view.company.id };
}

/** Company route: `doc` is the bare key and the scope is company. */
export async function loadCompanyCompare(s: Scoped, companyId: string, params: Params): Promise<CompareModel> {
  const q = parseCompareQuery(params);
  const raw = Array.isArray(params.doc) ? params.doc[0] : params.doc;
  if (!raw || !KEY_PATTERN.test(raw) || !UUID.test(companyId)) return notFound;
  const company = await s.company.getById(companyId);
  if (!company) return notFound;
  const result = await loadComparison(s, { companyId: company.id }, raw, q);
  if (!result.ok) return notFound;
  const doc: DocRef = { scope: "company", key: raw };
  return { status: "ok", comparison: result.data, view: q.view, doc, tab: kindInfo(result.data.a.kind).tab, companyId: company.id };
}
