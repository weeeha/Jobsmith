"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { rebuildQuestionsAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { PREP_COPY, rebuiltAnnouncement } from "@/lib/prep/copy";
import { messageFor } from "@/lib/pipeline/messages";

export function RebuildButton({ opportunityId }: { opportunityId: string }): React.ReactElement {
  const router = useRouter();
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();

  function rebuild() {
    startTransition(async () => {
      try {
        const result = await rebuildQuestionsAction(opportunityId);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        announce(rebuiltAnnouncement(result.data.rows));
        router.refresh();
      } catch (error) {
        console.error("rebuild failed", error);
        toast.error(`${PREP_COPY.hub.rebuildFailed} ${messageFor("unexpected")}`);
      }
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={rebuild}>
      {PREP_COPY.buttons.rebuild}
    </Button>
  );
}
