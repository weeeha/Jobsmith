import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { listApiTokens } from "@/lib/auth/api-token";
import { loadProfile } from "@/lib/profile/store";
import { listTimeZones } from "@/lib/time/zone";
import { timeZoneItems } from "@/lib/time/zone-list";
import { ApiTokensSection } from "@/components/settings/api-tokens-section";
import { ProfileSection } from "@/components/settings/profile-section";

export default async function SettingsPage() {
  const user = await requireUser();
  const s = scopedFor(user.id);
  const [tokens, profile] = await Promise.all([listApiTokens(s), loadProfile(s)]);

  return (
    <div className="flex flex-col gap-8 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <ProfileSection
        profile={{ headline: profile.headline, resumeMd: profile.resumeMd, timezone: profile.timezone }}
        timeZones={timeZoneItems(listTimeZones(), [profile.timezone])}
      />
      <ApiTokensSection tokens={tokens} />
    </div>
  );
}
