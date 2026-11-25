import type { ParseWarning } from "@/lib/prep/parse";
import { PREP_COPY } from "@/lib/prep/copy";

// Parse problems are warnings the owner can read, never errors.
export function BankWarnings({ warnings }: { warnings: ParseWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <details className="group text-sm">
      <summary className="inline-flex min-h-8 cursor-pointer items-center rounded-md px-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        {PREP_COPY.buttons.checkBank}
        <span className="ms-1 text-xs">({warnings.length})</span>
      </summary>
      <ul className="mt-1 flex flex-col gap-1 ps-4 text-muted-foreground">
        {warnings.map((w, i) => (
          <li key={`${w.line}-${w.code}-${i}`} className="break-words">
            {w.message}
          </li>
        ))}
      </ul>
    </details>
  );
}
