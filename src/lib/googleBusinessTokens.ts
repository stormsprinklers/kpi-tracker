import { getGoogleRefreshToken } from "@/lib/db/queries";
import { getGoogleBusinessOAuthConfig, refreshAccessToken } from "./googleBusinessOAuth";

export async function getGoogleBusinessAccessTokenForOrg(
  organizationId: string
): Promise<string> {
  const { clientId, clientSecret } = getGoogleBusinessOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client is not configured (GOOGLE_BUSINESS_CLIENT_ID / SECRET or AUTH_GOOGLE_*)");
  }
  const refresh = await getGoogleRefreshToken(organizationId);
  if (!refresh) {
    throw new Error("Google Business account not connected");
  }
  const { access_token } = await refreshAccessToken({
    refreshToken: refresh,
    clientId,
    clientSecret,
  });
  return access_token;
}
