import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A native select with the field look of Input. Used where the phone's own
 * picker is the better control (a speed list, a long list of device voices).
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">): React.ReactElement {
  return (
    <select
      className={cn(
        "h-10 min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
