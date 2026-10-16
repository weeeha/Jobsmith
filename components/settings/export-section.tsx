import { SettingsSection } from "@/components/settings/settings-section";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ExportSection() {
  return (
    <SettingsSection
      title="Export"
      intro="Every row you own, in one JSON file. Nothing secret is in it: no password, no token hashes."
    >
      <p className="text-sm text-muted-foreground">
        Includes companies, jobs, stages, people, every document version, your preferences and the timeline.
      </p>
      <div>
        {/* A plain link, not a button: it navigates to a download. A route
            handler answers it, so next/link's client routing is not wanted. */}
        <a href="/settings/export" download className={cn(buttonVariants({ variant: "outline" }))}>
          Export my data
        </a>
      </div>
    </SettingsSection>
  );
}
