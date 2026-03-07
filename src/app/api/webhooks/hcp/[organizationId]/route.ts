import { NextResponse } from "next/server";
import crypto from "crypto";
import { getOrganizationById } from "@/lib/db/queries";

function verifyHcpSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const signedPayload = `${timestamp}.${body}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Webhook endpoint is live",
  });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      Allow: "GET, HEAD, POST, OPTIONS",
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  const { organizationId } = await params;

  const org = await getOrganizationById(organizationId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("api-signature");
  const timestamp = request.headers.get("api-timestamp");

  // HCP setup/test: no signing secret yet, accept unsigned requests
  if (!signature || !timestamp) {
    console.log("[HCP Webhook] Unsigned setup/test request accepted for org", organizationId);
    if (rawBody) {
      try {
        const body = JSON.parse(rawBody);
        console.log("[HCP Webhook] Setup payload:", body?.event ?? body);
      } catch {
        console.log("[HCP Webhook] Raw body:", rawBody);
      }
    }
    return NextResponse.json({ ok: true, setup: true });
  }

  const secret = org.hcp_webhook_secret;
  if (!secret) {
    console.error("[HCP Webhook] Webhook secret not configured for organization", organizationId);
    return NextResponse.json(
      { error: "Webhook not configured for this organization" },
      { status: 500 }
    );
  }

  if (!verifyHcpSignature(rawBody, timestamp, signature, secret)) {
    console.warn("[HCP Webhook] Invalid signature for org", organizationId);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = (payload as { event?: string })?.event;
  console.log("[HCP Webhook] Verified event:", event ?? payload, "org:", organizationId);

  const companyId = org.hcp_company_id ?? "default";

  try {
    const { persistWebhookEvent } = await import("@/lib/sync/webhookPersist");
    await persistWebhookEvent(event ?? "unknown", (payload ?? {}) as Record<string, unknown>, companyId);
  } catch (err) {
    console.error("[HCP Webhook] Persist error:", err);
    // Still return 200 so HCP doesn't retry; we'll catch up on next full sync
  }

  return NextResponse.json({ ok: true });
}
