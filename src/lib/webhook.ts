/**
 * Build the universal webhook URL for an organization.
 * Use this single URL for Housecall Pro, GoHighLevel, Zapier, Make, or any automation platform.
 * When VERCEL_AUTOMATION_BYPASS_SECRET is set, appends the bypass query param
 * so webhook requests can pass Vercel Deployment Protection.
 */
export function getWebhookUrl(organizationId: string): string {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  let url = `${baseUrl}/api/webhooks/${organizationId}`;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    url += `?x-vercel-protection-bypass=${encodeURIComponent(bypass)}`;
  }
  return url;
}

/** @deprecated Use getWebhookUrl. Legacy HCP path still works via /api/webhooks/hcp/[orgId]. */
export function getHcpWebhookUrl(organizationId: string): string {
  return getWebhookUrl(organizationId);
}
