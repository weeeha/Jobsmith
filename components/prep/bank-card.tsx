import Link from "next/link";

import { AudioPanel } from "@/components/prep/audio-panel";
import { BankWarnings } from "@/components/prep/bank-warnings";
import { RebuildButton } from "@/components/prep/rebuild-button";
import { buttonVariants } from "@/components/ui/button";
import { ToneChip } from "@/components/fit/fit-chips";
import { formatDocRef } from "@/lib/artifacts/tabs";
import { PREP_COPY, questionCountLabel } from "@/lib/prep/copy";
import type { BankCard as BankCardModel } from "@/lib/prep/hub";
import { summaryLine } from "@/lib/prep/summary";
import { cn } from "@/lib/utils";

export function BankCard(props: {
  card: BankCardModel;
  opportunityId: string;
  basePath: string;
  selected: boolean;
  ttsOn: boolean;
}): React.ReactElement {
  const { card } = props;
  const href = `${props.basePath}?tab=prep&doc=${formatDocRef({ scope: "opportunity", key: card.key })}`;
  const quickFireHref = `${props.basePath}/quick-fire?doc=${formatDocRef({ scope: "opportunity", key: card.key })}`;
  const hasQuestions = card.questionCount > 0;

  return (
    <li
      data-bank-key={card.key}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10",
        props.selected && "ring-2 ring-ring",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="min-w-0 break-words text-sm font-medium text-foreground">{card.title}</h4>
          {card.stageLabel ? <ToneChip tone="outline">{card.stageLabel}</ToneChip> : null}
        </div>
        {card.notice === "no_questions" ? (
          <p className="break-words text-sm text-muted-foreground">{PREP_COPY.noQuestions}</p>
        ) : (
          <>
            <p className="text-sm text-foreground">{questionCountLabel(card.questionCount)}</p>
            <p className="text-sm text-muted-foreground">{summaryLine(card.summary)}</p>
          </>
        )}
      </div>

      <AudioPanel opportunityId={props.opportunityId} docKey={card.key} status={card.audio} ttsOn={props.ttsOn} />

      <div className="flex flex-wrap items-center gap-2">
        {hasQuestions ? (
          <Link
            href={href}
            aria-current={props.selected ? "true" : undefined}
            aria-label={`${props.selected ? PREP_COPY.hub.selectedBank : PREP_COPY.hub.selectBank}: ${card.title}`}
            className="inline-flex min-h-8 items-center rounded-md px-1 text-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {props.selected ? PREP_COPY.hub.bankSelected : PREP_COPY.hub.selectBank}
          </Link>
        ) : null}
        {hasQuestions ? (
          <Link href={quickFireHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {PREP_COPY.buttons.quickFire}
          </Link>
        ) : null}
        {card.needsRebuild ? <RebuildButton opportunityId={props.opportunityId} /> : null}
      </div>

      <BankWarnings warnings={card.warnings} />
    </li>
  );
}
