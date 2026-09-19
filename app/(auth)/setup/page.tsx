import { notFound } from "next/navigation";
import { isFirstRun } from "@/lib/auth/first-run";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await isFirstRun())) {
    notFound();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* A real <h1>, not <CardTitle>: CardTitle is a plain div with no
              heading semantics (a Card is not always a page's main heading),
              and this page's title is its only heading. The className copies
              CardTitle's own styling so the look is unchanged. */}
          <h1 className="font-heading text-base leading-snug font-medium">
            Create the first account
          </h1>
          <CardDescription>
            This runs once. After this account exists, sign-up closes unless it
            is explicitly allowed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetupForm />
        </CardContent>
      </Card>
    </main>
  );
}
