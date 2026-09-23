"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// An error boundary with a retry for every signed-in route (spec section 6).
// Placed at app/(app)/ so it wraps every route in that group, the same
// layout.tsx segment as AppShell. `retry` (not `reset`) is this Next.js
// version's stable prop (v16.3.0, node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/error.md) - it re-fetches and
// re-renders the segment, which `reset` does not.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-16 text-center">
      <p className="text-foreground">Something went wrong. Try again.</p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
