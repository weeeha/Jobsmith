import * as React from "react";

import { cn } from "@/lib/utils";

/** A Preferences section: title and intro on the left, fields on the right, stacked below md. */
export function PreferencesSection({
  title,
  intro,
  first,
  className,
  children,
}: {
  title: string;
  intro: string;
  first?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-4 md:flex-row md:gap-8", first ? "pb-6" : "border-t border-border py-6", className)}>
      <div className="flex flex-col gap-1 md:w-70 md:shrink-0">
        <h2 id={headingId} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-6 md:max-w-140">{children}</div>
    </section>
  );
}
