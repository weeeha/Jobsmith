import { handleAudioPlan } from "@/lib/bridge/audio-handlers";
import { productionDeps } from "@/lib/bridge/deps";

export async function GET(request: Request, ctx: RouteContext<"/api/bridge/opportunities/[slug]/audio/plan">) {
  const { slug } = await ctx.params;
  return handleAudioPlan(productionDeps(), request, slug);
}
