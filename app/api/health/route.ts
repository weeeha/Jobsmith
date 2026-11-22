import { healthResponse } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const { status, body } = await healthResponse();
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
