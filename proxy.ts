import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/login", "/setup"];

// A segment match, not pathname.startsWith("/api/auth"): that would also
// treat an unrelated route like "/api/authors" as public.
function isAuthApiPath(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.includes(pathname) || isAuthApiPath(pathname);
  if (isPublic) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    // Carries the query string too, so a return trip after login lands back
    // on the same filtered/paginated/etc. view, not just the same path.
    loginUrl.searchParams.set("from", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // api/bridge/ is excluded here, in the matcher, rather than with an early
  // return inside proxy() above: when the proxy runs at all, Next buffers
  // the request body before the route handler ever sees it (capped by
  // proxyClientMaxBodySize, 10 MB by default, silently truncated beyond
  // that), which would corrupt a CLI push long before readJsonCapped gets a
  // chance to enforce its own 4 MB limit correctly. Excluding the path from
  // the matcher means the proxy never runs on it at all, so no buffering
  // and no cookie-based redirect ever happens to a bearer-only request.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/bridge/).*)"],
};
