import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { logout } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <AppShell email={user.email} onSignOut={logout}>
      {children}
    </AppShell>
  );
}
