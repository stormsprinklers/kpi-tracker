import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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
const authPaths = ["/login", "/setup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (token.role === "investor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Allow login and setup without auth
  if (authPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Protect dashboard, debug, settings
  if (protectedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      const loginUrl = new URL("/login", request.url);
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
      token.role === "investor" &&
      investorBlockedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
