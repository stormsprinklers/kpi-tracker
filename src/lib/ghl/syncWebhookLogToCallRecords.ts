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

function getGhlValue(log: WebhookLog, key: string): string {
  const fromHeader = getHeader(log.headers ?? {}, key);
  if (fromHeader) return fromHeader;
  try {
    const parsed = JSON.parse(log.raw_body ?? "{}") as Record<string, unknown>;
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

function looksLikeGhlCall(log: WebhookLog): boolean {
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

  let rawPayload: Record<string, unknown> = {};
  try {
    rawPayload = log.raw_body ? (JSON.parse(log.raw_body) as Record<string, unknown>) : {};
  } catch {
    rawPayload = { _raw: log.raw_body };
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
