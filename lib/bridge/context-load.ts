import { buildContextDocument } from "./context";
import type { Scoped } from "@/lib/db/scoped";
import { getJobView } from "@/lib/pipeline/read";

// The context document for one job, or null when the job is absent. The
// caller checks the slug shape first.
export async function loadContextDocument(s: Scoped, slug: string, now: Date): Promise<string | null> {
  const view = await getJobView(s, slug);
  if (!view) return null;
  const companyDocuments = await s.artifact.listLatestForCompany(view.company.id);
  return buildContextDocument({ view, companyDocuments, generatedAt: now });
}
