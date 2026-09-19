import { notFound } from "next/navigation";
import { isFirstRun } from "@/lib/auth/first-run";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
          <CardTitle>Create the first account</CardTitle>
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
