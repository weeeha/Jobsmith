import { handleListOpportunities } from "@/lib/bridge/handlers";
import { productionDeps } from "@/lib/bridge/deps";

export async function GET(request: Request) {
  return handleListOpportunities(productionDeps(), request);
}
