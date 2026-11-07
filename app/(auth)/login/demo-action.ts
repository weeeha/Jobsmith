"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { createDemoAccount } from "@/lib/demo/create";

export type DemoState = { error: string } | undefined;

export async function demoAction(): Promise<DemoState> {
  // The button only renders in demo mode, but a server action is a public
  // endpoint, so the flag is checked here too.
  if (!env().DEMO_MODE) {
    return { error: "The demo is not available on this instance." };
  }

  const result = await createDemoAccount();
  if (!result.ok) {
    return {
      error:
        result.reason === "busy"
          ? "The demo is busy right now. Try again in a minute."
          : "Could not open the demo. Try again.",
    };
  }

  redirect("/board");
}
