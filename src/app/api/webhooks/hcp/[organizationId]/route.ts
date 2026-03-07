import { NextResponse } from "next/server";
import crypto from "crypto";
import { getOrganizationById } from "@/lib/db/queries";

/** Verify HMAC using api-signature + api-timestamp format (timestamp.body). Tries hex and base64. */
function verifyHcpSignatureTimestamp(
  body: string,
  timestamp: string,
  signature: string,
  secret: string | null
): boolean {
  if (!secret || typeof secret !== "string") return false;
  const secretTrimmed = secret.trim();
  const signedPayload = `${timestamp}.${body}`;
  const expectedHex = crypto.createHmac("sha256", secretTrimmed).update(signedPayload).digest("hex");
  const expectedBase64 = crypto.createHmac("sha256", secretTrimmed).update(signedPayload).digest("base64");
  const sigRaw = normalizeSignature(signature);
  const sigBufHex = Buffer.from(sigRaw, "hex");
  const expectedBufHex = Buffer.from(expectedHex, "hex");
  if (sigBufHex.length === expectedBufHex.length && sigBufHex.length > 0 && crypto.timingSafeEqual(sigBufHex, expectedBufHex)) return true;
  try {
    const sigBufB64 = Buffer.from(sigRaw, "base64");
    const expectedBufB64 = Buffer.from(expectedBase64, "base64");
    if (sigBufB64.length === expectedBufB64.length && sigBufB64.length > 0 && crypto.timingSafeEqual(sigBufB64, expectedBufB64)) return true;
  } catch {
    // ignore base64 parse errors
  }
  return false;
}

/** Normalize signature: strip sha256= or v1= prefix, return hex string */
function normalizeSignature(sig: string): string {
  const s = sig.trim();
  if (s.startsWith("sha256=")) return s.slice(7).trim();
  if (s.startsWith("v1=")) return s.slice(3).trim();
  return s;
}

/**
 * Verify HMAC using x-housecall-signature format (body only).
 * Per Rollout/HCP docs: body may be JSON.stringify(parsed) not raw - try both.
 * Tries hex and base64 for signature encoding.
 */
function verifyHcpSignatureBodyOnly(rawBody: string, signature: string, secret: string | null): boolean {
  if (!secret) return false;
  const secretTrimmed = secret.trim();
  const sigRaw = normalizeSignature(signature);

  const tryBody = (body: string) => {
    const expectedHex = crypto.createHmac("sha256", secretTrimmed).update(body).digest("hex");
    const expectedBase64 = crypto.createHmac("sha256", secretTrimmed).update(body).digest("base64");
    const sigBufHex = Buffer.from(sigRaw, "hex");
    const expectedBufHex = Buffer.from(expectedHex, "hex");
    if (sigBufHex.length === expectedBufHex.length && sigBufHex.length > 0 && crypto.timingSafeEqual(sigBufHex, expectedBufHex)) return true;
    try {
      const sigBufB64 = Buffer.from(sigRaw, "base64");
      const expectedBufB64 = Buffer.from(expectedBase64, "base64");
      if (sigBufB64.length === expectedBufB64.length && sigBufB64.length > 0 && crypto.timingSafeEqual(sigBufB64, expectedBufB64)) return true;
    } catch {
      // ignore base64 parse errors
    }
    return false;
  };

  if (tryBody(rawBody)) return true;
  try {
    const parsed = JSON.parse(rawBody);
    const normalized = JSON.stringify(parsed);
    if (normalized !== rawBody && tryBody(normalized)) return true;
  } catch {
    // not JSON, skip normalized attempt
  }
  return false;
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
  console.log("[HCP Webhook] POST received", { organizationId });

  const rawBody = await request.text();
  const org = await getOrganizationById(organizationId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  const apiSignature = request.headers.get("api-signature");
  const apiTimestamp = request.headers.get("api-timestamp");
  const housecallSignature = request.headers.get("x-housecall-signature");

  const bypassSignatureCheck = process.env.HOUSECALLPRO_WEBHOOK_ACCEPT_ALL === "true";

  // HCP connection test: accept test payloads without verification so the webhook URL can be saved.
  // HCP may send {"foo":"bar"}, empty body, {}, or {"event":"webhook.test"} when testing the URL.
  // Also accept any small payload (<256 bytes) without "event" - catches unknown test formats.
  const isConnectionTest = (() => {
    if (!rawBody || rawBody.trim() === "") return true;
    if (rawBody.length < 256) {
      try {
        const parsed = JSON.parse(rawBody);
        if (parsed && typeof parsed === "object") {
          const keys = Object.keys(parsed);
          const ev = parsed.event;
          if (ev === "webhook.test" || ev === "ping" || ev === "connection_test") return true;
          if (!("event" in parsed)) return true;
          if (keys.length === 0) return true;
          if (keys.length === 1 && parsed.foo === "bar") return true;
        }
      } catch {
        // not JSON - still accept as connection test if small (e.g. plain "ping")
        return true;
      }
    }
    try {
      const parsed = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object") return false;
      const keys = Object.keys(parsed);
      if (keys.length === 0) return true;
      if (keys.length === 1 && parsed.foo === "bar") return true;
      const ev = parsed.event;
      if (ev === "webhook.test" || ev === "ping" || ev === "connection_test") return true;
      if (!("event" in parsed)) return true;
    } catch {
      return false;
    }
    return false;
  })();
  if (isConnectionTest) {
    console.log("[HCP Webhook] Connection test accepted for org", organizationId, "bodyLength:", rawBody?.length ?? 0);
    return NextResponse.json({ ok: true, test: true });
  }

  // HCP setup/test: no signing headers at all, accept unsigned requests (unless bypass is on - then persist)
  if (!apiSignature && !housecallSignature && !bypassSignatureCheck) {
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
  if (!secret && !bypassSignatureCheck) {
    console.error("[HCP Webhook] Webhook secret not configured for organization", organizationId);
    return NextResponse.json(
      { error: "Webhook not configured for this organization" },
      { status: 500 }
    );
  }

  let verified = false;
  let pathTried = "none";
  if (housecallSignature && secret) {
    pathTried = "x-housecall-signature";
    verified = verifyHcpSignatureBodyOnly(rawBody, housecallSignature, secret);
    // Per Rollout/HCP docs: some implementations use JSON.stringify(parsed body) for the signed payload
    if (!verified && rawBody) {
      try {
        const normalizedBody = JSON.stringify(JSON.parse(rawBody));
        if (normalizedBody !== rawBody) {
          verified = verifyHcpSignatureBodyOnly(normalizedBody, housecallSignature, secret);
        }
      } catch {
        // ignore
      }
    }
  }
  if (!verified && apiSignature && apiTimestamp && secret) {
    pathTried = "api-signature+timestamp";
    verified = verifyHcpSignatureTimestamp(rawBody, apiTimestamp, apiSignature, secret);
  }

  if (!verified && !bypassSignatureCheck) {
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
    console.warn("[HCP Webhook] Signature verification failed for org", organizationId, debugInfo);
    return NextResponse.json({ ok: true, unverified: true });
  }
  if (!verified && bypassSignatureCheck) {
    console.log("[HCP Webhook] Bypass active - persisting event without verification");
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
    const { initSchema } = await import("@/lib/db");
    await initSchema();
    const { persistWebhookEvent } = await import("@/lib/sync/webhookPersist");
    await persistWebhookEvent(event ?? "unknown", (payload ?? {}) as Record<string, unknown>, organizationId, companyId);
  } catch (err) {
    console.error("[HCP Webhook] Persist error:", err);
    // Still return 200 so HCP doesn't retry; we'll catch up on next full sync
  }

  return NextResponse.json({ ok: true });
}
