/**
 * Sync a stored webhook log entry to call_records.
 * Used by Developer Console to re-process GHL call webhooks without making fake calls.
 */
import type { WebhookLog } from "@/lib/db/queries";
import { persistGhlCallRecord } from "./persistCallRecord";

const GHL_KEYS = ["csr", "booking_value", "date", "time", "duration", "transcript", "customer_phone"] as const;

function getHeader(headers: Record<string, string>, key: string): string {
  const headerKey = key.replace(/_/g, "-");
  const lower = key.toLowerCase();
  const variants = [
    headerKey,
    headerKey.toLowerCase(),
    `x-${headerKey}`,
    `x-${headerKey.toLowerCase()}`,
  ];
  for (const v of variants) {
    for (const [k, val] of Object.entries(headers)) {
      if (k.toLowerCase() === v.toLowerCase() && val != null && val !== "") return val;
    }
  }
  return "";
}

const BODY_KEY_VARIANTS: Record<string, string[]> = {
  csr: ["csr", "CSR", "Csr"],
  booking_value: ["booking_value", "bookingValue", "booking-value", "bookingvalue"],
  date: ["date", "Date"],
  time: ["time", "Time"],
  duration: ["duration", "Duration"],
  transcript: ["transcript", "Transcript"],
  customer_phone: ["customer_phone", "customerPhone", "customer-phone", "phone", "Phone"],
};

function getFromObject(obj: Record<string, unknown>, keyVariants: string[]): string {
  const keys = Object.keys(obj);
  for (const variant of keyVariants) {
    const vLo = variant.toLowerCase().replace(/-/g, "_");
    for (const k of keys) {
      const kLo = k.toLowerCase().replace(/-/g, "_");
      if (kLo === vLo || kLo.replace(/_/g, "") === vLo.replace(/_/g, "")) {
        const val = obj[k];
        if (val != null && val !== "") return String(val);
      }
    }
  }
  return "";
}

function parseBody(raw: string | null): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  // Form-urlencoded fallback
  try {
    const params = new URLSearchParams(raw);
    const obj: Record<string, unknown> = {};
    params.forEach((v, k) => { obj[k] = v; });
    return obj;
  } catch {
    /* ignore */
  }
  return {};
}

function getGhlValue(log: WebhookLog, key: string): string {
  const fromHeader = getHeader(log.headers ?? {}, key);
  if (fromHeader) return fromHeader;
  const parsed = parseBody(log.raw_body);
  const variants = BODY_KEY_VARIANTS[key] ?? [key];
  let val = getFromObject(parsed, variants);
  if (val) return val;
  const nested = (parsed.data ?? parsed.payload ?? parsed.body) as Record<string, unknown> | undefined;
  if (nested && typeof nested === "object") {
    val = getFromObject(nested, variants);
  }
  return val ?? "";
}

function looksLikeGhlCall(log: WebhookLog): boolean {
  // If source is ghl, treat as GHL and require only csr + booking_value
  if (log.source === "ghl") {
    const csr = getGhlValue(log, "csr");
    const booking = getGhlValue(log, "booking_value");
    return !!csr.trim() && !!booking.trim();
  }
  const csr = getGhlValue(log, "csr");
  const booking = getGhlValue(log, "booking_value");
  const hasEvent = (() => {
    try {
      const p = JSON.parse(log.raw_body ?? "{}") as { event?: string };
      return typeof p?.event === "string";
    } catch {
      return false;
    }
  })();
  return !hasEvent && !!csr.trim() && !!booking.trim();
}

export interface SyncResult {
  ok: boolean;
  webhookLogId: string;
  synced: boolean;
  skipped?: string;
  error?: string;
}

export async function syncWebhookLogToCallRecords(
  log: WebhookLog,
  org: { hcp_company_id?: string | null }
): Promise<SyncResult> {
  if (!looksLikeGhlCall(log)) {
    return { ok: true, webhookLogId: log.id, synced: false, skipped: "not_ghl_call" };
  }

  const companyId = org.hcp_company_id ?? "default";
  const payload = {
    csr: getGhlValue(log, "csr"),
    booking_value: getGhlValue(log, "booking_value"),
    date: getGhlValue(log, "date"),
    time: getGhlValue(log, "time"),
    duration: getGhlValue(log, "duration"),
    transcript: getGhlValue(log, "transcript"),
    customer_phone: getGhlValue(log, "customer_phone"),
  };

  const rawPayload = parseBody(log.raw_body) as Record<string, unknown>;
  if (Object.keys(rawPayload).length === 0 && log.raw_body) {
    (rawPayload as Record<string, unknown>)._raw = log.raw_body;
  }

  try {
    const result = await persistGhlCallRecord(
      log.organization_id,
      companyId,
      payload,
      rawPayload,
      {} // No fallback city from stored logs
    );
    return {
      ok: true,
      webhookLogId: log.id,
      synced: !result.skipped,
      skipped: result.skipped,
    };
  } catch (err) {
    return {
      ok: false,
      webhookLogId: log.id,
      synced: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
