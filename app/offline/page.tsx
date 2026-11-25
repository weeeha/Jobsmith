import type { Metadata } from "next";

import { OfflineNotice } from "@/components/offline/offline-notice";

// A public page with no session check on purpose: it carries no user data (the
// saved-job list is read in the browser from Cache Storage), and the service
// worker stores it on install to answer pages that cannot load offline. The
// proxy matcher leaves it out so it never redirects to /login.
export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage(): React.ReactElement {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8">
      <OfflineNotice />
    </main>
  );
}
