import { getUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { buildExport, exportFileName, logExportError } from "@/lib/export/build";
import { loadProfile } from "@/lib/profile/store";

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
    const profile = await loadProfile(s);
    const body = JSON.stringify(doc, null, 2);
    // Counts and timing only: the body holds the resume and every note.
    console.info("[export]", JSON.stringify({ requestId, ms: Date.now() - started }));
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFileName(now, profile.timezone)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    logExportError(requestId, error);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
