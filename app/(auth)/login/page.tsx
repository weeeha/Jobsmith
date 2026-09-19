import { redirect } from "next/navigation";
import { isFirstRun } from "@/lib/auth/first-run";
import { getUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  if (await isFirstRun()) {
    redirect("/setup");
  }

  if (await getUser()) {
    redirect("/board");
  }

  const from = typeof searchParams.from === "string" ? searchParams.from : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* A real <h1>, not <CardTitle>: CardTitle is a plain div with no
              heading semantics (a Card is not always a page's main heading),
              and this page's title is its only heading. The className copies
              CardTitle's own styling so the look is unchanged. */}
          <h1 className="font-heading text-base leading-snug font-medium">Log in</h1>
        </CardHeader>
        <CardContent>
          <LoginForm from={from} />
        </CardContent>
      </Card>
    </main>
  );
}
