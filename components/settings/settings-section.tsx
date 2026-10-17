import * as React from "react";

import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: string;
  intro: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Two-column section from the Settings drafts: intro left, content right,
 * a hairline between sections (none above the first: the page title is
 * enough), stacked below the md breakpoint. Server-safe
 * so the page can compose it without a client boundary.
 */
export function SettingsSection({ title, intro, children, className }: SettingsSectionProps) {
  return (
    <section className={cn("grid gap-4 border-t border-border pt-8 first:border-t-0 first:pt-0 md:grid-cols-3 md:gap-8", className)}>
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4 md:col-span-2">{children}</div>
    </section>
  );
}
