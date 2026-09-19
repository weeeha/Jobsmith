"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setupAction, type SetupState } from "./actions";

export function SetupForm({ requireSetupToken }: { requireSetupToken: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(setupAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
        />
      </div>
      {requireSetupToken && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="setupToken">Setup token</Label>
          <Input id="setupToken" name="setupToken" type="password" required autoComplete="off" />
        </div>
      )}
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Create account
      </Button>
    </form>
  );
}
