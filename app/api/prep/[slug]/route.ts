import { requireUser } from "@/lib/auth/session";
import { audioDeps } from "@/lib/audio/deps";
import { scopedFor } from "@/lib/db/scoped";
import { env } from "@/lib/env";
import { audioContext } from "@/lib/prep/audio-status";
import { buildPrepManifest } from "@/lib/prep/manifest";

// The saved-job manifest is user data: never stored by a shared cache. The
// service worker keeps its own copy in the job's cache when the user saves it.
const NO_STORE = { "cache-control": "private, no-store" };

export async function GET(_request: Request, ctx: RouteContext<"/api/prep/[slug]">) {
  const user = await requireUser();
  const { slug } = await ctx.params;
  const s = scopedFor(user.id);
  const audio = await audioContext(s, audioDeps(), env().TTS);
  const manifest = await buildPrepManifest(s, slug, audio);
  if (!manifest) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  return Response.json(manifest, { headers: NO_STORE });
}
