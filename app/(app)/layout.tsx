import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { Toaster } from "@/components/ui/sonner";
import { logout } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <LiveAnnouncerProvider>
      <AppShell email={user.email} onSignOut={logout}>
        {children}
      </AppShell>
      <Toaster />
    </LiveAnnouncerProvider>
  );
}
