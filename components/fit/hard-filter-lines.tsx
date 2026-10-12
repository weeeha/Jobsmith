import Link from "next/link";

import type { HeadingLevel } from "@/components/fit/fit-result-body";
import type { HardFilterResult } from "@/lib/fit/hard-filters";
import { FIT_MESSAGES, missesFiltersLine, uncheckedFiltersLine } from "@/lib/fit/messages";

// Underlined at rest: a link inside a line of muted text must differ from the
// text by more than color (axe link-in-text-block).
export const FIT_LINK_CLASS = "text-foreground underline underline-offset-4";

/** The "Hard filters" heading with what the job passes, misses or could not be checked on. */
export function HardFilterLines({
  hardFilters,
  hasHardFilters,
  headingLevel,
}: {
  hardFilters: HardFilterResult;
  hasHardFilters: boolean;
  headingLevel: HeadingLevel;
}) {
  const Heading = headingLevel;
  return (
    <div className="flex flex-col gap-1">
      <Heading className="text-sm font-medium text-foreground">{FIT_MESSAGES.hardFilters}</Heading>
      {hasHardFilters ? (
        <>
          <p className="text-sm text-foreground">
            {hardFilters.failed.length > 0 ? missesFiltersLine(hardFilters.failed) : FIT_MESSAGES.passes}
          </p>
          {hardFilters.unchecked.length > 0 ? (
            <p className="text-sm text-muted-foreground">{uncheckedFiltersLine(hardFilters.unchecked)}</p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {FIT_MESSAGES.noFiltersSet}{" "}
          <Link href="/preferences" className={FIT_LINK_CLASS}>
            {FIT_MESSAGES.setPreferences}
          </Link>
        </p>
      )}
    </div>
  );
}
