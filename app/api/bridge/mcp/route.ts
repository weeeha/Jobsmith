import { handleMcp } from "@/lib/bridge/mcp-handler";
import { productionDeps } from "@/lib/bridge/deps";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleMcp(productionDeps(), request);
}

export async function GET(request: Request) {
  return handleMcp(productionDeps(), request);
}

export async function DELETE(request: Request) {
  return handleMcp(productionDeps(), request);
}
