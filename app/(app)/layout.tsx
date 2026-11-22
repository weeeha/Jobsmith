import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { OfflineProvider } from "@/components/offline/offline-provider";
import { Toaster } from "@/components/ui/sonner";
import { userHash } from "@/lib/storage/keys";
import { logout } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <LiveAnnouncerProvider>
      <OfflineProvider userHash={userHash(user.id)} buildId={process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}>
        <AppShell email={user.email} onSignOut={logout}>
          {children}
        </AppShell>
        <Toaster />
      </OfflineProvider>
    </LiveAnnouncerProvider>
  );
}
