import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { upsertGoogleBusinessOAuthRefreshToken } from "@/lib/db/queries";
import {
  exchangeAuthorizationCode,
  getGoogleBusinessOAuthConfig,
} from "@/lib/googleBusinessOAuth";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const base = new URL("/team/reviews", request.url);

  if (oauthError) {
    base.searchParams.set("google", "error");
    base.searchParams.set("reason", oauthError);
    return NextResponse.redirect(base);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gbp_oauth_state")?.value;
  const orgFromCookie = cookieStore.get("gbp_oauth_org")?.value;
  cookieStore.delete("gbp_oauth_state");
  cookieStore.delete("gbp_oauth_org");

  if (
    !code ||
    !state ||
    !expectedState ||
    state !== expectedState ||
    orgFromCookie !== session.user.organizationId
  ) {
    base.searchParams.set("google", "error");
    base.searchParams.set("reason", "invalid_state");
    return NextResponse.redirect(base);
  }

  const { clientId, clientSecret, redirectUri } = getGoogleBusinessOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    base.searchParams.set("google", "error");
    base.searchParams.set("reason", "oauth_not_configured");
    return NextResponse.redirect(base);
  }

  try {
    const tokens = await exchangeAuthorizationCode({
      code,
      redirectUri,
      clientId,
      clientSecret,
    });
    if (!tokens.refresh_token) {
      base.searchParams.set("google", "error");
      base.searchParams.set("reason", "no_refresh_token");
      return NextResponse.redirect(base);
    }

    await initSchema();
    await upsertGoogleBusinessOAuthRefreshToken({
      organization_id: session.user.organizationId,
      google_refresh_token: tokens.refresh_token,
    });

    base.searchParams.set("google", "connected");
    return NextResponse.redirect(base);
  } catch {
    base.searchParams.set("google", "error");
    base.searchParams.set("reason", "token_exchange_failed");
    return NextResponse.redirect(base);
  }
}
