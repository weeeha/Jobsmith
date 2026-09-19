import { redirect } from "next/navigation";
import { isFirstRun } from "@/lib/auth/first-run";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  if (await isFirstRun()) {
    redirect("/setup");
  }

  const from = typeof searchParams.from === "string" ? searchParams.from : undefined;

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm from={from} />
        </CardContent>
      </Card>
    </main>
  );
}
