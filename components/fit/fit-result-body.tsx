import { FitChip } from "@/components/fit/fit-chip";
import { FIT_MESSAGES, thresholdLine } from "@/lib/fit/messages";
import type { StoredFit } from "@/lib/fit/stored";

export type HeadingLevel = "h3" | "h4";

/**
 * The score, the threshold line, the summary and the two lists. The same
 * block reads the job page's card and the Preferences test box; the heading
 * level is the only difference, because the two sit at different depths.
 */
export function FitResultBody({
  fit,
  threshold,
  headingLevel,
}: {
  fit: Pick<StoredFit, "score" | "summary" | "pros" | "cons">;
  threshold: number;
  headingLevel: HeadingLevel;
}) {
  const Heading = headingLevel;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <FitChip score={fit.score} />
        <p className="text-sm text-muted-foreground">{thresholdLine(fit.score, threshold)}</p>
      </div>
      <p className="break-words text-foreground">{fit.summary}</p>
      {fit.pros.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Heading className="text-sm font-medium text-foreground">{FIT_MESSAGES.whyItFits}</Heading>
          <ul className="list-disc pl-5 text-sm text-foreground">
            {fit.pros.map((pro, index) => (
              <li key={index} className="break-words">
                {pro}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {fit.cons.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Heading className="text-sm font-medium text-foreground">{FIT_MESSAGES.mayNotFit}</Heading>
          <ul className="list-disc pl-5 text-sm text-foreground">
            {fit.cons.map((con, index) => (
              <li key={index} className="break-words">
                {con}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
