import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import {
  buildGoogleBusinessAuthUrl,
  getGoogleBusinessOAuthConfig,
} from "@/lib/googleBusinessOAuth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientId, clientSecret, redirectUri } = getGoogleBusinessOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Google OAuth is not configured. Set GOOGLE_BUSINESS_CLIENT_ID, GOOGLE_BUSINESS_CLIENT_SECRET, and NEXTAUTH_URL (or GOOGLE_BUSINESS_REDIRECT_URI).",
      },
      { status: 500 }
    );
  }

  const state = crypto.randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  cookieStore.set("gbp_oauth_state", state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  cookieStore.set("gbp_oauth_org", session.user.organizationId, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = buildGoogleBusinessAuthUrl({ state, redirectUri, clientId });
  return NextResponse.redirect(url);
}
