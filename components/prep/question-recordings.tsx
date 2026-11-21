"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteRecordingAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { messageFor } from "@/lib/pipeline/messages";
import { PREP_COPY } from "@/lib/prep/copy";

function dateLabel(iso: string): string {
  // A fixed locale and zone keep the label the same on the server and in the browser.
  return new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
}

/** The recordings kept for one question, each with a player and its own Delete. */
export function QuestionRecordings(props: {
  recordings: { assetId: string; createdAt: string }[];
}): React.ReactElement | null {
  const copy = PREP_COPY.drill.record;
  const router = useRouter();
  const announce = useAnnounce();
  const [gone, setGone] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState<string | null>(null);
  const shown = props.recordings.filter((r) => !gone.has(r.assetId));
  if (shown.length === 0) return null;

  async function remove(assetId: string) {
    setPending(assetId);
    try {
      const result = await deleteRecordingAction(assetId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setGone((prev) => new Set(prev).add(assetId));
      announce(copy.deleted);
      router.refresh();
    } catch (error) {
      console.error("delete recording failed", error);
      toast.error(`${copy.deleteFailed} ${messageFor("unexpected")}`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{copy.heading}</p>
      <ul className="flex flex-col gap-2">
        {shown.map((r) => {
          const date = dateLabel(r.createdAt);
          return (
            <li key={r.assetId} className="flex min-w-0 flex-wrap items-center gap-2">
              <audio controls preload="none" src={`/api/assets/${r.assetId}`} aria-label={copy.playLabel(date)} className="h-10 min-w-0 max-w-full flex-1" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={copy.deleteLabel(date)}
                disabled={pending === r.assetId}
                onClick={() => void remove(r.assetId)}
              >
                {copy.delete}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
