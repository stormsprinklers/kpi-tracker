/**
 * Stable base URL for webhooks. Uses VERCEL_PROJECT_PRODUCTION_URL so webhook links
 * don't change on every deploy. Set WEBHOOK_BASE_URL to override (e.g. custom domain).
 */
function getWebhookBaseUrl(): string {
  if (process.env.WEBHOOK_BASE_URL) {
    return process.env.WEBHOOK_BASE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

/**
 * Build the universal webhook URL for an organization.
 * Uses stable production URL so HCP/GHL config doesn't need updates on each deploy.
 * When VERCEL_AUTOMATION_BYPASS_SECRET is set, appends the bypass query param
 * so webhook requests can pass Vercel Deployment Protection.
 */
export function getWebhookUrl(organizationId: string): string {
  const baseUrl = getWebhookBaseUrl();
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

/**
 * Build the GoHighLevel webhook URL for call completion webhooks.
 * Uses stable production URL so GHL config doesn't need updates on each deploy.
 */
export function getGhlWebhookUrl(organizationId: string): string {
  const baseUrl = getWebhookBaseUrl();
  let url = `${baseUrl}/api/webhooks/ghl/${organizationId}`;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    url += `?x-vercel-protection-bypass=${encodeURIComponent(bypass)}`;
  }
  return url;
}
