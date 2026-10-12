import { getUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { buildExport, exportFileName } from "@/lib/export/build";
import { logDbErrorSafely } from "@/lib/log/db-error";
import { canonicalTimeZone } from "@/lib/time/zone";

// A download, so it is never cached and never served to anyone else. The proxy
// already redirects a request with no session cookie to /login; the 401 below
// covers a cookie that no longer names a session.
export async function GET(): Promise<Response> {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const requestId = crypto.randomUUID();
  const started = Date.now();
  try {
    const s = scopedFor(user.id);
    const now = new Date();
    const doc = await buildExport(s, now);
    const body = JSON.stringify(doc, null, 2);
    // Counts and timing only: the body holds the resume and every note.
    console.info("[export]", JSON.stringify({ requestId, ms: Date.now() - started }));
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFileName(now, canonicalTimeZone(doc.profile?.timezone ?? "") ?? "UTC")}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    logDbErrorSafely("[export]", { requestId }, error);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
