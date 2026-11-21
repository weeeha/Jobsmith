import { handleAudioUpload } from "@/lib/bridge/audio-handlers";
import { productionDeps } from "@/lib/bridge/deps";

export async function PUT(request: Request, ctx: RouteContext<"/api/bridge/opportunities/[slug]/audio">) {
  const { slug } = await ctx.params;
  return handleAudioUpload(productionDeps(), request, slug);
}
