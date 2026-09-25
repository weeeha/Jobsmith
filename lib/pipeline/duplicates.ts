import type { Scoped } from "@/lib/db/scoped";
import { dedupeHash, type DedupeParts } from "@/lib/intake/dedupe";

export async function findActiveDuplicate(s: Scoped, parts: DedupeParts): Promise<{ id: string; slug: string } | null> {
  const hash = dedupeHash(parts);
  const rows = await s.opportunity.listActiveForDedupe();
  const match = rows.find(
    (row) => dedupeHash({ companyName: row.companyName, roleTitle: row.roleTitle, location: row.location }) === hash,
  );
  return match ? { id: match.id, slug: match.slug } : null;
}
