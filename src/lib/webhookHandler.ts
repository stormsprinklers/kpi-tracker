/**
 * Shared webhook handler logic for universal and platform-specific endpoints.
 * Handles HCP payload format and signature verification.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getOrganizationById, insertWebhookLog } from "@/lib/db/queries";
import { initSchema } from "@/lib/db";
import { persistWebhookEvent } from "@/lib/sync/webhookPersist";
import { persistGhlCallRecord } from "@/lib/ghl/persistCallRecord";

const GHL_KEYS = ["csr", "booking_value", "date", "time", "duration", "transcript", "customer_phone"] as const;

function getGhlValue(request: Request, rawBody: string, key: string): string {
  const headerKey = key.replace(/_/g, "-");
  const variants = [headerKey, headerKey.toLowerCase(), `x-${headerKey}`, `x-${headerKey.toLowerCase()}`];
  for (const v of variants) {
    const header = request.headers.get(v);
    if (header != null && header !== "") return header;
  }
  try {
    const parsed = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    const lower = key.toLowerCase();
    for (const k of Object.keys(parsed)) {
      if (k.toLowerCase() === lower) {
        const val = parsed[k];
        return val != null ? String(val) : "";
      }
    }
  } catch {
    /* ignore */
  }
  return "";
}

function looksLikeGhlCall(request: Request, rawBody: string): boolean {
  const csr = getGhlValue(request, rawBody, "csr");
  const booking = getGhlValue(request, rawBody, "booking_value");
  const hasEvent = (() => {
    try {
      const p = JSON.parse(rawBody || "{}") as { event?: string };
      return typeof p?.event === "string";
    } catch {
      return false;
    }
  })();
  return !hasEvent && !!csr.trim() && !!booking.trim();
}

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

const logPrefix = "[Webhook]";

async function logInboundWebhook(
  organizationId: string,
  rawBody: string,
  request: Request,
  status: "processed" | "skipped" | "received",
  skipReason?: string
) {
  // #region agent log
  console.log("[WH-DBG] H1 HCP logInboundWebhook entered", JSON.stringify({ hypothesisId: "H1", organizationId, status, skipReason, rawBodyLen: rawBody?.length }));
  // #endregion
  try {
    await initSchema();
    const headersObj: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headersObj[k] = v;
    });
    // #region agent log
    console.log("[WH-DBG] H2 HCP about to insertWebhookLog", JSON.stringify({ hypothesisId: "H2", organizationId }));
    // #endregion
    await insertWebhookLog({
      organizationId,
      source: "hcp",
      rawBody: rawBody || null,
      headers: headersObj,
      status,
      skipReason: skipReason ?? null,
    });
    // #region agent log
    console.log("[WH-DBG] H2 HCP insertWebhookLog succeeded", JSON.stringify({ hypothesisId: "H2", organizationId }));
    // #endregion
  } catch (err) {
    // #region agent log
    console.log("[WH-DBG] H2 HCP insertWebhookLog FAILED", JSON.stringify({ hypothesisId: "H2", organizationId, err: String(err) }));
    // #endregion
    console.error(`${logPrefix} Failed to log webhook to webhook_logs:`, err);
  }
}

export async function handleWebhookGET() {
  return NextResponse.json({
    ok: true,
    message: "Webhook endpoint is live",
  });
}

export async function handleWebhookHEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function handleWebhookOPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      Allow: "GET, HEAD, POST, OPTIONS",
    },
  });
}

export async function handleWebhookPOST(
  request: Request,
  organizationId: string
): Promise<NextResponse> {
  console.log("[WH-LIVE-CHECK] handleWebhookPOST entered version 2026-03-08-02", { organizationId });

  const rawBody = await request.text();
  const org = await getOrganizationById(organizationId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const companyId = org.hcp_company_id ?? "default";
  if (looksLikeGhlCall(request, rawBody)) {
    console.log(`${logPrefix} GHL call detected on main webhook route - persisting to call_records`);
    try {
      await initSchema();
      const headersObj: Record<string, string> = {};
      request.headers.forEach((v, k) => { headersObj[k] = v; });
      await insertWebhookLog({
        organizationId,
        source: "ghl",
        rawBody: rawBody || null,
        headers: headersObj,
        status: "processed",
        skipReason: null,
      });
      const payload: Record<string, string> = {};
      for (const key of GHL_KEYS) {
        payload[key] = getGhlValue(request, rawBody, key);
      }
      let rawPayload: Record<string, unknown> = {};
      try {
        rawPayload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
      } catch {
        rawPayload = { _raw: rawBody };
      }
      const fallbackCity = request.headers.get("x-vercel-ip-city") ?? undefined;
      const result = await persistGhlCallRecord(
        organizationId,
        companyId,
        { csr: payload.csr ?? "", booking_value: payload.booking_value ?? "", date: payload.date ?? "", time: payload.time ?? "", duration: payload.duration ?? "", transcript: payload.transcript ?? "", customer_phone: payload.customer_phone ?? "" },
        rawPayload,
        { fallbackCity, callHeaders: headersObj }
      );
      if (result.skipped) {
        console.log(`${logPrefix} GHL persist skipped:`, result.skipped);
      }
    } catch (err) {
      console.error(`${logPrefix} GHL persist error:`, err);
    }
    return NextResponse.json({ ok: true });
  }

  const apiSignature = request.headers.get("api-signature");
  const apiTimestamp = request.headers.get("api-timestamp");
  const housecallSignature = request.headers.get("x-housecall-signature");

  const bypassSignatureCheck = process.env.HOUSECALLPRO_WEBHOOK_ACCEPT_ALL === "true";

  // Connection test: accept test payloads without verification so the webhook URL can be saved.
  const isConnectionTest = (() => {
    if (!rawBody || rawBody.trim() === "") return true;
    if (rawBody.length < 256) {
      try {
        const parsed = JSON.parse(rawBody);
        if (parsed && typeof parsed === "object") {
          const ev = parsed.event;
          if (ev === "webhook.test" || ev === "ping" || ev === "connection_test") return true;
          if (!("event" in parsed)) return true;
          if (Object.keys(parsed).length === 0) return true;
          if (Object.keys(parsed).length === 1 && parsed.foo === "bar") return true;
        }
      } catch {
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
    console.log(`${logPrefix} Connection test accepted for org`, organizationId);
    await logInboundWebhook(organizationId, rawBody, request, "skipped", "connection_test");
    return NextResponse.json({ ok: true, test: true });
  }

  // Setup/test: no signing headers at all, accept unsigned requests
  if (!apiSignature && !housecallSignature && !bypassSignatureCheck) {
    console.log(`${logPrefix} Unsigned setup/test request accepted for org`, organizationId);
    await logInboundWebhook(organizationId, rawBody, request, "skipped", "unsigned_setup");
    return NextResponse.json({ ok: true, setup: true });
  }

  const secret = org.hcp_webhook_secret;
  if (!secret && !bypassSignatureCheck) {
    console.error(`${logPrefix} Webhook secret not configured for organization`, organizationId);
    await logInboundWebhook(organizationId, rawBody, request, "skipped", "no_webhook_secret");
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
      secretLength: secret?.length ?? 0,
    };
    console.warn(`${logPrefix} Signature verification failed for org`, organizationId, debugInfo);
    await logInboundWebhook(organizationId, rawBody, request, "skipped", "signature_unverified");
    return NextResponse.json({ ok: true, unverified: true });
  }
  if (!verified && bypassSignatureCheck) {
    console.log(`${logPrefix} Bypass active - persisting event without verification`);
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    await logInboundWebhook(organizationId, rawBody, request, "skipped", "invalid_json");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = (payload as { event?: string })?.event;
  console.log(`${logPrefix} Verified event:`, event ?? payload, "org:", organizationId);
  // #region agent log
  console.log("[WH-DBG] verified path, about to logInboundWebhook", JSON.stringify({ organizationId, event }));
  // #endregion

  const payloadObj = (payload ?? {}) as Record<string, unknown>;

  // Log webhook FIRST (before persist) so we capture it even if persist hangs or times out
  await logInboundWebhook(organizationId, rawBody, request, "processed");

  try {
    await persistWebhookEvent(event ?? "unknown", payloadObj, organizationId, companyId);
  } catch (err) {
    console.error(`${logPrefix} Persist error:`, err);
  }

  return NextResponse.json({ ok: true });
}
