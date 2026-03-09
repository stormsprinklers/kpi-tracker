/**
 * Forward webhook request to an external URL.
 * Sends full headers (as JSON) and raw payload so the target receives everything
 * for use in Zapier, Make, marketing tools, etc.
 */
export async function forwardWebhook(
  rawBody: string,
  request: Request,
  targetUrl: string,
  source: string
): Promise<void> {
  const url = targetUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) return;

  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headersObj[k] = v;
  });

  const forwardHeaders: Record<string, string> = {
    "Content-Type": request.headers.get("content-type") ?? "application/json",
    "X-Webhook-Forwarded-Source": source,
    "X-Webhook-Forwarded-At": new Date().toISOString(),
    "X-Webhook-Original-Headers": JSON.stringify(headersObj),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: forwardHeaders,
      body: rawBody,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[WebhookForward] ${source} -> ${url} returned ${res.status}`);
    }
  } catch (err) {
    console.error(`[WebhookForward] ${source} -> ${url} failed:`, err);
  }
}
