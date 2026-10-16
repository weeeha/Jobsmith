import { getUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { collectExport, exportFileName } from "@/lib/export/collect";

// "Export my data": every row the user owns, as one JSON download. The
// session is checked here even though the proxy already requires a cookie,
// because route-level protection is never the only check.
export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ code: "unauthorized", message: "Log in to export your data." }, { status: 401 });
  }
  const now = new Date();
  const doc = await collectExport(
    scopedFor(user.id),
    { email: user.email, name: user.name, createdAt: new Date(user.createdAt) },
    now,
  );
  return new Response(JSON.stringify(doc, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
