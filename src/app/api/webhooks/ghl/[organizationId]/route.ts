import { NextResponse } from "next/server";
import { getOrganizationById, getWebhookForwarding, insertWebhookLog } from "@/lib/db/queries";
import { forwardWebhook } from "@/lib/forwardWebhook";
import { initSchema } from "@/lib/db";
import { persistGhlCallRecord } from "@/lib/ghl/persistCallRecord";
import { extractGhlPayload, parseBody } from "@/lib/ghl/extractGhlPayload";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "GHL webhook endpoint is live",
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  const { organizationId } = await params;
  console.log("[WH-LIVE-CHECK] GHL route /api/webhooks/ghl/[organizationId] version 2026-03-08-01");

  const rawBody = await request.text();
  const org = await getOrganizationById(organizationId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const companyId = org.hcp_company_id ?? "default";

  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headersObj[k] = v;
  });

  const payload = extractGhlPayload(headersObj, rawBody);

  let rawPayload: Record<string, unknown> = parseBody(rawBody) as Record<string, unknown>;
  if (rawPayload && Object.keys(rawPayload).length === 0 && rawBody) {
    rawPayload = { _raw: rawBody };
  } else if (!rawPayload) {
    rawPayload = { _raw: rawBody };
  }

  try {
    await initSchema();
    // #region agent log
    console.log("[WH-DBG] H1 GHL about to insertWebhookLog", JSON.stringify({ hypothesisId: "H1", organizationId }));
    // #endregion
    // Log immediately so we capture payload even if persist times out or fails later
    await insertWebhookLog({
      organizationId,
      source: "ghl",
      rawBody: rawBody || null,
      headers: headersObj,
      status: "processed",
      skipReason: null,
    });
    // #region agent log
    console.log("[WH-DBG] H2 GHL insertWebhookLog succeeded", JSON.stringify({ hypothesisId: "H2", organizationId }));
    // #endregion
    const fallbackCity = request.headers.get("x-vercel-ip-city") ?? undefined;
    const result = await persistGhlCallRecord(
      organizationId,
      companyId,
      {
        csr: payload.csr ?? "",
        booking_value: payload.booking_value ?? "",
        date: payload.date ?? "",
        time: payload.time ?? "",
        duration: payload.duration ?? "",
        transcript: payload.transcript ?? "",
        customer_phone: payload.customer_phone ?? "",
      },
      rawPayload,
      { fallbackCity, callHeaders: headersObj }
    );
    if (result.skipped) {
      console.log("[GHL Webhook] Skipped:", result.skipped);
    }
  } catch (err) {
    console.error("[GHL Webhook] Persist error:", err);
    return NextResponse.json({ error: "Failed to persist call record" }, { status: 500 });
  }

  const fwdConfig = (await getWebhookForwarding(organizationId)).find((c) => c.source === "ghl");
  if (fwdConfig?.enabled && fwdConfig.forward_url?.trim()) {
    forwardWebhook(rawBody, request, fwdConfig.forward_url, "ghl").catch((e) =>
      console.error("[GHL Webhook] Forward error:", e)
    );
  }

  return NextResponse.json({ ok: true });
}
