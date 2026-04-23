import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Paths that need to be reachable WITHOUT a session:
 *   /login            — sign-in form
 *   /register         — gated by env, but the page itself has to load
 *   /forgot-password  — email-entry form
 *   /reset-password   — consumes reset token
 *   /setup-account    — consumes invitation token (the big miss — invitees
 *                       clicking an invite email had no session yet, so
 *                       middleware was bouncing them to /login)
 */
const PUBLIC_AUTH_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/setup-account",
]);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;
  const isAuthPage = PUBLIC_AUTH_PATHS.has(pathname);

  // Redirect authenticated users away from auth pages. /setup-account and
  // /reset-password are one-time flows — if the visitor is already signed
  // in, they almost certainly want the dashboard, not the flow.
  if (isAuthenticated && isAuthPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Allow auth pages for unauthenticated users
  if (isAuthPage) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Admin-only route protection
  if (pathname.startsWith("/api/users")) {
    if (req.auth?.user?.role !== "admin") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|api/health|api/sync/trigger|api/sync/ingest|_next/static|_next/image|favicon.ico).*)",
  ],
};
