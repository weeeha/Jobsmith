import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { loadJobCompare } from "@/lib/compare/page-model";
import { documentHrefForCompany, documentHrefForJob } from "@/lib/compare/links";
import { CompareScreen } from "@/components/compare/compare-page";

export default async function JobComparePage(props: PageProps<"/jobs/[slug]/compare">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const s = scopedFor(user.id);
  const model = await loadJobCompare(s, slug, searchParams);
  if (model.status === "not_found") notFound();

  const backHref =
    model.doc.scope === "opportunity"
      ? documentHrefForJob(slug, model.doc, model.tab)
      : await documentHrefForCompany(s, model.companyId, model.doc.key);

  return (
    <CompareScreen
      comparison={model.comparison}
      view={model.view}
      basePath={`/jobs/${slug}/compare`}
      doc={model.doc}
      backHref={backHref}
    />
  );
}
