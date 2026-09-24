import { handlePushArtifacts } from "@/lib/bridge/handlers";
import { productionDeps } from "@/lib/bridge/deps";

export async function PUT(request: Request, ctx: RouteContext<"/api/bridge/opportunities/[slug]/artifacts">) {
  const { slug } = await ctx.params;
  return handlePushArtifacts(productionDeps(), request, slug);
}
