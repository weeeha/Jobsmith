import { CircleCheck, CircleDot, CircleMinus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { FIT_BAND_WORDS, fitBand, type FitBand } from "@/lib/fit/bands";
import { cn } from "@/lib/utils";

// The tone rides on the mark, never on the label: the registry's rule for
// status colors, because the tokens are tuned for icons and not for text
// contrast.
const BAND_MARK: Record<FitBand, { Icon: typeof CircleCheck; tone: string }> = {
  strong: { Icon: CircleCheck, tone: "text-status-approved" },
  partial: { Icon: CircleDot, tone: "text-status-pending" },
  weak: { Icon: CircleMinus, tone: "text-status-action" },
};

export function FitChip({ score, size = "default" }: { score: number; size?: "sm" | "default" }) {
  const band = fitBand(score);
  const { Icon, tone } = BAND_MARK[band];
  return (
    <Badge variant="outline" className={cn("text-foreground", size === "default" && "h-6 px-2.5 text-sm")}>
      <Icon aria-hidden className={tone} />
      <span className="sr-only">Fit score </span>
      {score}
      <span className="sr-only">, {FIT_BAND_WORDS[band]}</span>
    </Badge>
  );
}
