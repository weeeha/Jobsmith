"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useAnnounce } from "@/components/live-announcer";
import { changeLabel, nextIndex, restingLabel } from "@/lib/compare/navigator";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Changes in document order, skipping the view that is display:none (its offsetParent is null). */
function visibleChanges(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-change]")).filter(
    (el) => el.offsetParent !== null,
  );
}

export function ChangeNavigator({ total }: { total: number }) {
  const announce = useAnnounce();
  const [current, setCurrent] = React.useState(-1);

  const go = React.useCallback(
    (dir: "next" | "previous") => {
      const index = nextIndex(current, total, dir);
      if (index < 0) return;
      setCurrent(index);
      const el = visibleChanges()[index];
      if (el) {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        el.setAttribute("tabindex", "-1");
        el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        el.focus({ preventScroll: true });
      }
      announce(changeLabel(index, total));
    },
    [current, total, announce],
  );

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "]") go("next");
      else if (e.key === "[") go("previous");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div
      role="group"
      aria-label="Changes"
      className="fixed inset-x-0 bottom-16 z-30 flex items-center justify-between gap-2 border-t border-border bg-background px-4 pt-2 pb-safe md:static md:justify-end md:border-t-0 md:bg-transparent md:p-0 md:pb-0"
    >
      <span className="text-sm text-muted-foreground">
        {current < 0 ? restingLabel(total) : changeLabel(current, total)}
      </span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={current <= 0} onClick={() => go("previous")}>
          Previous
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={total === 0 || current >= total - 1} onClick={() => go("next")}>
          Next
        </Button>
      </div>
    </div>
  );
}
