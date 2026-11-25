import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { serveAsset } from "@/lib/audio/serve";
import { getStorage } from "@/lib/storage";

export async function GET(request: Request, ctx: RouteContext<"/api/assets/[id]">) {
  const user = await requireUser();
  const { id } = await ctx.params;
  return serveAsset(scopedFor(user.id), getStorage(), id, request.headers.get("range"));
}
