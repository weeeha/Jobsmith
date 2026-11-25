"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { OFFLINE_COPY } from "@/lib/offline/copy";

const COPY = OFFLINE_COPY.install;
export const INSTALL_HINT_KEY = "jobsmith-install-hint-dismissed";

const noopSubscribe = () => () => {};

function standalone(): boolean {
  if (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) return true;
  // Safari on iOS reports the home screen app through this older flag.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function shouldShow(): boolean {
  return "caches" in window && !standalone() && !dismissedBefore();
}

/**
 * A collapsible card telling the user how to install the app and what each
 * platform does to saved jobs. Dismissible and remembered per device; never
 * shown inside the installed app or where Cache Storage is missing.
 */
export function InstallHint(): React.ReactElement | null {
  const eligible = React.useSyncExternalStore(noopSubscribe, shouldShow, () => false);
  const [dismissed, setDismissed] = React.useState(false);
  if (!eligible || dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(INSTALL_HINT_KEY, "1");
    } catch {
      // Private mode: it stays hidden for this page view only.
    }
    setDismissed(true);
  }

  return (
    <details className="group min-w-0 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <summary className="cursor-pointer list-none rounded-md text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {COPY.heading}
      </summary>
      <div className="mt-2 flex flex-col items-start gap-2">
        <p className="min-w-0 break-words text-sm text-muted-foreground">{COPY.body}</p>
        <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
          {COPY.dismiss}
        </Button>
      </div>
    </details>
  );
}
