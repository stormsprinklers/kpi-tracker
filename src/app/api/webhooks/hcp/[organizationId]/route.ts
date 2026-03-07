import { NextResponse } from "next/server";
import crypto from "crypto";
import { getOrganizationById } from "@/lib/db/queries";

/** Verify HMAC using api-signature + api-timestamp format (timestamp.body) */
function verifyHcpSignatureTimestamp(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const secretTrimmed = secret.trim();
  const signedPayload = `${timestamp}.${body}`;
  const expected = crypto
    .createHmac("sha256", secretTrimmed)
    .update(signedPayload)
    .digest("hex");
  const sigHex = normalizeSignature(signature);
  const sigBuf = Buffer.from(sigHex, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length || sigBuf.length === 0) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

/** Normalize signature: strip sha256= or v1= prefix, return hex string */
function normalizeSignature(sig: string): string {
  const s = sig.trim();
  if (s.startsWith("sha256=")) return s.slice(7).trim();
  if (s.startsWith("v1=")) return s.slice(3).trim();
  return s;
}

/** Verify HMAC using x-housecall-signature format (body only) */
function verifyHcpSignatureBodyOnly(body: string, signature: string, secret: string): boolean {
  const secretTrimmed = secret.trim();
  const expected = crypto.createHmac("sha256", secretTrimmed).update(body).digest("hex");
  const sigHex = normalizeSignature(signature);
  const sigBuf = Buffer.from(sigHex, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length || sigBuf.length === 0) return false;
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
  const apiSignature = request.headers.get("api-signature");
  const apiTimestamp = request.headers.get("api-timestamp");
  const housecallSignature = request.headers.get("x-housecall-signature");

  // HCP setup/test: no signing headers at all, accept unsigned requests
  if (!apiSignature && !housecallSignature) {
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

  let verified = false;
  if (housecallSignature) {
    // x-housecall-signature: HMAC of body only
    verified = verifyHcpSignatureBodyOnly(rawBody, housecallSignature, secret);
  }
  if (!verified && apiSignature && apiTimestamp) {
    // api-signature + api-timestamp: HMAC of timestamp.body
    verified = verifyHcpSignatureTimestamp(rawBody, apiTimestamp, apiSignature, secret);
  }

  if (!verified) {
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
