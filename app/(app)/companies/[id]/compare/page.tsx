import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { loadCompanyCompare } from "@/lib/compare/page-model";
import { documentHrefForCompany } from "@/lib/compare/links";
import { CompareScreen } from "@/components/compare/compare-page";

export default async function CompanyComparePage(props: PageProps<"/companies/[id]/compare">) {
  const user = await requireUser();
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const s = scopedFor(user.id);
  const model = await loadCompanyCompare(s, id, searchParams);
  if (model.status === "not_found") notFound();

  return (
    <CompareScreen
      comparison={model.comparison}
      view={model.view}
      basePath={`/companies/${model.companyId}/compare`}
      doc={model.doc}
      backHref={await documentHrefForCompany(s, model.companyId, model.doc.key)}
    />
  );
}
