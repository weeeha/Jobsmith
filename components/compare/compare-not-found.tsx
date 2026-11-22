"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { backHrefFromCompareUrl } from "@/lib/compare/links";

/** The 404 body for both compare routes: it links back to the document the URL named. */
export function CompareNotFound() {
  const pathname = usePathname();
  const search = useSearchParams();
  const href = backHrefFromCompareUrl(pathname, new URLSearchParams(search.toString()));
  return (
    <div className="flex flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold text-foreground">Version not found</h1>
      <p className="text-sm text-muted-foreground">That document or version does not exist.</p>
      {href ? (
        <Link href={href} className="text-sm underline">
          Back to the document
        </Link>
      ) : null}
    </div>
  );
}
