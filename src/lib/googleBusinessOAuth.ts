/**
 * Google Business Profile OAuth + token refresh.
 * Scopes: https://www.googleapis.com/auth/business.manage
 * Enable "Google My Business API" / Business Profile APIs in Cloud Console and add redirect URI.
 */

export const GOOGLE_BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";

export function getGoogleBusinessOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId =
    process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim() ||
    process.env.AUTH_GOOGLE_ID?.trim() ||
    "";
  const clientSecret =
    process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim() ||
    process.env.AUTH_GOOGLE_SECRET?.trim() ||
    "";
  const appUrl = process.env.NEXTAUTH_URL?.trim() || process.env.VERCEL_URL?.trim() || "";
  const base = appUrl.startsWith("http") ? appUrl : appUrl ? `https://${appUrl}` : "";
  const redirectUri =
    process.env.GOOGLE_BUSINESS_REDIRECT_URI?.trim() ||
    (base ? `${base}/api/team/reviews/google/oauth/callback` : "");
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleBusinessAuthUrl(params: {
  state: string;
  redirectUri: string;
  clientId: string;
}): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_BUSINESS_SCOPE);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", params.state);
  return u.toString();
}

export async function exchangeAuthorizationCode(params: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ?? data.error ?? `Token exchange failed (${res.status})`
    );
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ access_token: string; expires_in?: number }> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ?? data.error ?? `Refresh failed (${res.status})`
    );
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}
