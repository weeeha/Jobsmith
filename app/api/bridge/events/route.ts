import { handleListEvents } from "@/lib/bridge/events";
import { productionDeps } from "@/lib/bridge/deps";

export async function GET(request: Request) {
  return handleListEvents(productionDeps(), request);
}
