import { notFound } from "next/navigation";
import { z } from "zod";

import { ItemView } from "@/components/library/item-view";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { getLibraryItem } from "@/lib/library/items";
import { markHistory, usedInJobs } from "@/lib/library/usage";

export default async function LibraryItemPage(props: PageProps<"/library/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const s = scopedFor(user.id);
  const item = await getLibraryItem(s, id);
  if (!item) notFound();

  let source: { slug: string; label: string } | null = null;
  if (item.sourceOpportunityId) {
    const opportunity = await s.opportunity.getById(item.sourceOpportunityId);
    if (opportunity) {
      const company = await s.company.getById(opportunity.companyId);
      source = { slug: opportunity.slug, label: `${company?.name ?? ""}, ${opportunity.roleTitle}`.replace(/^, /, "") };
    }
  }
  const used = item.questionKey === null ? null : ((await usedInJobs(s, [item.questionKey])).get(item.questionKey) ?? 0);
  const history = item.questionKey === null ? null : await markHistory(s, item.questionKey);

  return (
    <div className="p-6">
      <ItemView item={item} source={source} used={used} history={history} />
    </div>
  );
}
