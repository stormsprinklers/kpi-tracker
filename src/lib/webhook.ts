/**
 * Build the HCP webhook URL for an organization.
 * When VERCEL_AUTOMATION_BYPASS_SECRET is set, appends the bypass query param
 * so webhook requests from Housecall Pro can pass Vercel Deployment Protection.
 */
export function getHcpWebhookUrl(organizationId: string): string {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  let url = `${baseUrl}/api/webhooks/hcp/${organizationId}`;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    url += `?x-vercel-protection-bypass=${encodeURIComponent(bypass)}`;
  }
  return url;
}
