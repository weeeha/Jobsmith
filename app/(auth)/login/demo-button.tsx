"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { demoAction, type DemoState } from "./demo-action";

export function DemoButton() {
  const [state, action, pending] = useActionState<DemoState, FormData>(demoAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-2">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Opening the demo…" : "Try the demo"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Opens your own copy with six fictional jobs. Nothing to sign up for; the copy is deleted after 24 hours.
      </p>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
