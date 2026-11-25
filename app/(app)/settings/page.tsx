import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { listApiTokens } from "@/lib/auth/api-token";
import { getProfile, timeZoneOptions } from "@/lib/profile";
import { ApiTokensSection } from "@/components/settings/api-tokens-section";
import { ExportSection } from "@/components/settings/export-section";
import { ProfileSection } from "@/components/settings/profile-section";
import { VoiceSection } from "@/components/settings/voice-section";
import { env } from "@/lib/env";
import { getPrepSettings } from "@/lib/prep/settings";

export default async function SettingsPage() {
  const user = await requireUser();
  const s = scopedFor(user.id);
  const [tokens, profile, prep, storage] = await Promise.all([listApiTokens(s), getProfile(s), getPrepSettings(s), s.asset.totals()]);

  return (
    <div className="flex max-w-4xl flex-col gap-8 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      {/* Grouped so the first section is :first-child and drops its hairline. */}
      <div className="flex flex-col gap-8">
        <ProfileSection profile={profile} timeZones={timeZoneOptions()} />
        {/* No provider call here: the section loads the voice list itself, on demand. */}
        <VoiceSection provider={env().TTS?.provider ?? null} settings={prep} storage={storage} />
        <ApiTokensSection tokens={tokens} />
        <ExportSection />
      </div>
    </div>
  );
}
