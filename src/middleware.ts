import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const protectedPaths = [
  "/debug",
  "/settings",
  "/timesheets",
  "/time-insights",
  "/call-insights",
  "/billing",
  "/team",
  "/insights",
];
const authPaths = ["/login", "/setup", "/signup", "/forgot-password", "/reset-password"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Allow API auth routes, webhooks (no session), and static assets
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Protect /api/debug - require auth, return 401 JSON for API routes
  if (pathname.startsWith("/api/debug")) {
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role === "investor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Allow login, setup, signup, forgot-password, reset-password without auth
  if (authPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Protect dashboard, debug, settings
  if (protectedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!session?.user) {
      const loginUrl = new URL("/login", req.nextUrl);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Investor: read-only access; block Settings, Developer Console, Timesheets, Team, Billing
    const investorBlockedPaths = [
      "/settings",
      "/debug",
      "/timesheets",
      "/team",
      "/billing",
    ];
    if (
      session.user.role === "investor" &&
      investorBlockedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    ) {
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
