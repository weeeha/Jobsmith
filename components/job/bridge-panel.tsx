import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { PasteDialogTrigger } from "@/components/job/paste-dialog";
import { DEFAULT_KIND_FOR_TAB } from "@/lib/artifacts/kinds";

export function BridgePanel(props: {
  slug: string;
  opportunityId: string;
  stages: { id: string; label: string }[];
}): React.ReactElement {
  const pullCommand = `jobsmith pull ${props.slug}`;
  const pushCommand = `jobsmith push ${props.slug}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">Bring documents in</h3>
        <p className="text-sm text-muted-foreground">
          {"Pull this job's context, write documents next to it, then push the folder."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Pull</span>
          {/* break-all: a slug is user-chosen text slugified with no length
              ceiling of its own, so this command is exactly the kind of
              long, unbroken string that needs a wrap point. */}
          <code className="break-all font-mono text-sm">{pullCommand}</code>
          <CopyButton value={pullCommand} label="Copy the pull command" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Push</span>
          <code className="break-all font-mono text-sm">{pushCommand}</code>
          <CopyButton value={pushCommand} label="Copy the push command" />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {`Push reads the ${props.slug}-*.md files in the current folder. Add --prefix when your files start with something else.`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/settings" className="text-sm text-foreground underline underline-offset-4">
          Create a token in Settings
        </Link>
        <PasteDialogTrigger
          opportunityId={props.opportunityId}
          target={{ mode: "new" }}
          defaultKind={DEFAULT_KIND_FOR_TAB.prep}
          stages={props.stages}
          label="Paste markdown"
        />
      </div>
    </div>
  );
}
