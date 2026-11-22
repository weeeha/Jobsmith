import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { formatCompareHref } from "@/lib/compare/pair";
import type { DocRef } from "@/lib/artifacts/tabs";

/**
 * The "Compare versions" link for a document's actions row. It renders only
 * when the document has two or more versions; the compare page picks the
 * default pair itself, so the link carries just the document.
 */
export function CompareVersionsLink(props: {
  basePath: string;
  docRef: DocRef;
  versions: number;
  title: string;
}): React.ReactElement | null {
  if (props.versions < 2) return null;
  return (
    <Link
      href={formatCompareHref(props.basePath, { doc: props.docRef })}
      aria-label={`Compare versions of ${props.title}`}
      className={buttonVariants({ variant: "outline" })}
    >
      Compare versions
    </Link>
  );
}
