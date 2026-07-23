import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic, cookie-presence-only checks - never a database call here.
// Real authorization happens in the DAL (lib/dal.ts), which every
// protected Server Component/Action/Route Handler calls independently.
const PROTECTED_PREFIXES = ["/dashboard", "/admin"];
const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isLoginPage = pathname === "/login";
  const authenticated = hasSessionCookie(request);

  if (isProtectedRoute && !authenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoginPage && authenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
