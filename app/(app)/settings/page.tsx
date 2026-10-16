import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { listApiTokens } from "@/lib/auth/api-token";
import { getProfile, timeZoneOptions } from "@/lib/profile";
import { ApiTokensSection } from "@/components/settings/api-tokens-section";
import { ExportSection } from "@/components/settings/export-section";
import { ProfileSection } from "@/components/settings/profile-section";

export default async function SettingsPage() {
  const user = await requireUser();
  const s = scopedFor(user.id);
  const [tokens, profile] = await Promise.all([listApiTokens(s), getProfile(s)]);

  return (
    <div className="flex max-w-4xl flex-col gap-8 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      {/* Grouped so the first section is :first-child and drops its hairline. */}
      <div className="flex flex-col gap-8">
        <ProfileSection profile={profile} timeZones={timeZoneOptions()} />
        <ApiTokensSection tokens={tokens} />
        <ExportSection />
      </div>
    </div>
  );
}
