import { handleGetContext } from "@/lib/bridge/handlers";
import { productionDeps } from "@/lib/bridge/deps";

export async function GET(request: Request, ctx: RouteContext<"/api/bridge/opportunities/[slug]/context">) {
  const { slug } = await ctx.params;
  return handleGetContext(productionDeps(), request, slug);
}
