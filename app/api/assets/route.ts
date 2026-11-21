import { randomBytes } from "node:crypto";

import { handleRecordingUpload } from "@/lib/audio/recording-upload";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { getStorage } from "@/lib/storage";

// Kept recordings only: a clip is made by the audio actions, never uploaded.
export async function POST(request: Request) {
  const user = await requireUser();
  return handleRecordingUpload(scopedFor(user.id), { storage: getStorage(), randomHex: (n) => randomBytes(n).toString("hex") }, request);
}
