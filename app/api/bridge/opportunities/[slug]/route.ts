import { handleGetJob } from "@/lib/bridge/handlers";
import { productionDeps } from "@/lib/bridge/deps";

export async function GET(request: Request, ctx: RouteContext<"/api/bridge/opportunities/[slug]">) {
  const { slug } = await ctx.params;
  return handleGetJob(productionDeps(), request, slug);
}
