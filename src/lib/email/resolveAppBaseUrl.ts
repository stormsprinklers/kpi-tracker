/** Same resolution as pulse cron emails (NEXT_PUBLIC_APP_URL or production default). */
export function resolveAppBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (u) return u.replace(/\/$/, "");
  return "https://homeservicesanalytics.com";
}
