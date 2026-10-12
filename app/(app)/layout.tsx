import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { TimeZoneProvider } from "@/components/time-zone-provider";
import { Toaster } from "@/components/ui/sonner";
import { scopedFor } from "@/lib/db/scoped";
import { loadProfile } from "@/lib/profile/store";
import { logout } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const profile = await loadProfile(scopedFor(user.id));
  return (
    <LiveAnnouncerProvider>
      <TimeZoneProvider zone={profile.timezone}>
        <AppShell email={user.email} onSignOut={logout}>
          {children}
        </AppShell>
      </TimeZoneProvider>
      <Toaster />
    </LiveAnnouncerProvider>
  );
}
