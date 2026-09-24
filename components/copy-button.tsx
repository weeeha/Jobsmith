"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAnnounce } from "@/components/live-announcer";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const announce = useAnnounce();

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
      announce("Copied.");
    } catch (error) {
      // A clipboard write can be refused by the browser (no user gesture in
      // some embedded contexts, a denied permission) or simply unsupported;
      // either way nothing was copied, and the toast below is the one place
      // this frame gives the user a way forward by hand.
      console.error("copy failed", error);
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" aria-label={label} onClick={handleClick}>
      Copy
    </Button>
  );
}
