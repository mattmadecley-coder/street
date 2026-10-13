import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, isValidAdminSession } from "@/lib/admin-auth";
import { SESSION_COOKIE_NAME, sessionSigningSecret, verifySessionToken } from "@/lib/admin-session-token";

export const config = { matcher: ["/admin/:path*"] };

/**
 * First, cheap gate for /admin: the request must carry a correctly signed, unexpired
 * account session cookie, or the legacy shared-password cookie. Whether that session
 * is still valid (not revoked, account active, which mode we are in) is decided by the
 * database on every page and action (lib/admin-guard.ts), so this is never the only check.
 *
 * It also tells server code which admin path is being requested, overwriting anything
 * the client sent under that header name.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-admin-pathname", pathname);
    return NextResponse.next({ request: { headers } });
  };

  if (pathname === "/admin/login") return forward();

  const legacyValid = await isValidAdminSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  const accountValid = Boolean(await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value, sessionSigningSecret()));
  if (legacyValid || accountValid) return forward();

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}
