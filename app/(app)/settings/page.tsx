import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { listApiTokens } from "@/lib/auth/api-token";
import { ApiTokensSection } from "@/components/settings/api-tokens-section";

export default async function SettingsPage() {
  const user = await requireUser();
  const tokens = await listApiTokens(scopedFor(user.id));

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <ApiTokensSection tokens={tokens} />
    </div>
  );
}
