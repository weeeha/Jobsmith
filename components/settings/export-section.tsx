import { buttonVariants } from "@/components/ui/button";

export function ExportSection() {
  return (
    <section aria-labelledby="settings-export" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 id="settings-export" className="text-base font-semibold text-foreground">
          Export my data
        </h2>
        <p className="text-sm text-muted-foreground">
          Download everything you saved in Jobsmith as one JSON file. Passwords, sign-in sessions and token secrets are
          left out.
        </p>
      </div>
      <div>
        {/* A plain link, not next/link: the response is a file, not a page. */}
        <a href="/settings/export" download className={buttonVariants({ variant: "outline" })}>
          Download JSON
        </a>
      </div>
    </section>
  );
}
