/**
 * Public app origin for links in emails (invites, password reset, pulse).
 * Prefer NEXT_PUBLIC_APP_URL, then NEXTAUTH_URL (common on Vercel), then production default.
 */
export function resolveAppBaseUrl(): string {
  const pub = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (pub) return pub.replace(/\/$/, "");
  const auth = process.env.NEXTAUTH_URL?.trim();
  if (auth) return auth.replace(/\/$/, "");
  return "https://homeservicesanalytics.com";
}
