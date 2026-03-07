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

  // #region agent log
  const allHeaderNames = Array.from(request.headers.keys());
  const sigRelatedHeaders = allHeaderNames.filter((h) => /signature|timestamp|sig|housecall|api/i.test(h));
  fetch("http://127.0.0.1:7243/ingest/336e9f29-31e3-4865-8cc2-c2bfd265975c", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "8628a2" },
    body: JSON.stringify({
      sessionId: "8628a2",
      location: "webhook/route.ts:POST",
      message: "Webhook POST received",
      data: {
        organizationId,
        rawBodyLength: rawBody.length,
        hasApiSignature: !!apiSignature,
        hasApiTimestamp: !!apiTimestamp,
        hasHousecallSignature: !!housecallSignature,
        sigRelatedHeaderNames: sigRelatedHeaders,
        allHeaderNames,
        secretLength: org.hcp_webhook_secret?.length ?? 0,
      },
      timestamp: Date.now(),
      hypothesisId: "H1_H4_H5",
    }),
  }).catch(() => {});
  // #endregion

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
  let pathTried = "none";
  if (housecallSignature) {
    pathTried = "x-housecall-signature";
    verified = verifyHcpSignatureBodyOnly(rawBody, housecallSignature, secret);
  }
  if (!verified && apiSignature && apiTimestamp) {
    pathTried = "api-signature+timestamp";
    verified = verifyHcpSignatureTimestamp(rawBody, apiTimestamp, apiSignature, secret);
  }

  // #region agent log
  if (!verified) {
    const sigUsed = housecallSignature ?? apiSignature ?? "";
    const isHexLike = /^[a-fA-F0-9]+$/.test(normalizeSignature(sigUsed));
    fetch("http://127.0.0.1:7243/ingest/336e9f29-31e3-4865-8cc2-c2bfd265975c", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "8628a2" },
      body: JSON.stringify({
        sessionId: "8628a2",
        location: "webhook/route.ts:401",
        message: "Verification failed, returning 401",
        data: {
          pathTried,
          verified,
          sigLength: sigUsed.length,
          sigStartsWithSha256: sigUsed.trim().startsWith("sha256="),
          sigIsHexLike: isHexLike,
          rawBodyLength: rawBody.length,
        },
        timestamp: Date.now(),
        hypothesisId: "H2_H3_H5",
      }),
    }).catch(() => {});
  }
  // #endregion

  if (!verified) {
    const debugInfo = {
      organizationId,
      rawBodyLength: rawBody.length,
      hasApiSignature: !!apiSignature,
      hasApiTimestamp: !!apiTimestamp,
      hasHousecallSignature: !!housecallSignature,
      pathTried,
      sigLength: (housecallSignature ?? apiSignature ?? "").length,
      sigStartsWithSha256: (housecallSignature ?? apiSignature ?? "").trim().startsWith("sha256="),
      allHeaderNames: Array.from(request.headers.keys()),
      secretLength: secret?.length ?? 0,
    };
    console.log("[HCP Webhook DEBUG] 401 diagnostic:", JSON.stringify(debugInfo));
    console.warn("[HCP Webhook] Invalid signature for org", organizationId);
    return NextResponse.json(
      { error: "Unauthorized", _debug: debugInfo },
      { status: 401 }
    );
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
