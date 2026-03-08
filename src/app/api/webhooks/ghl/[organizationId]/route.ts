import { NextResponse } from "next/server";
import { getOrganizationById, insertWebhookLog } from "@/lib/db/queries";
import { initSchema } from "@/lib/db";
import { persistGhlCallRecord } from "@/lib/ghl/persistCallRecord";

const KEYS = [
  "csr",
  "booking_value",
  "date",
  "time",
  "duration",
  "transcript",
  "customer_phone",
] as const;

function getValue(
  request: Request,
  rawBody: string,
  key: string
): string {
  const headerKey = key.replace(/_/g, "-");
  const variants = [headerKey, headerKey.toLowerCase(), `x-${headerKey}`, `x-${headerKey.toLowerCase()}`];
  for (const v of variants) {
    const header = request.headers.get(v);
    if (header != null && header !== "") return header;
  }

  try {
    const body = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    const lower = key.toLowerCase();
    for (const k of Object.keys(body)) {
      if (k.toLowerCase() === lower) {
        const v = body[k];
        return v != null ? String(v) : "";
      }
    }
  } catch {
    /* ignore */
  }
  return "";
}

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
  console.log("[GHL Webhook] POST received", { organizationId });

  const rawBody = await request.text();
  const org = await getOrganizationById(organizationId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const companyId = org.hcp_company_id ?? "default";

  const payload: Record<string, string> = {};
  for (const key of KEYS) {
    payload[key] = getValue(request, rawBody, key);
  }

  let rawPayload: Record<string, unknown> = {};
  try {
    rawPayload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    rawPayload = { _raw: rawBody };
  }

  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headersObj[k] = v;
  });

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
      rawPayload
    );
    if (result.skipped) {
      console.log("[GHL Webhook] Skipped:", result.skipped);
    }
  } catch (err) {
    console.error("[GHL Webhook] Persist error:", err);
    return NextResponse.json({ error: "Failed to persist call record" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
