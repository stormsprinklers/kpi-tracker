/**
 * Sync a stored webhook log entry to call_records.
 * Used by Developer Console to re-process GHL call webhooks without making fake calls.
 */
import type { WebhookLog } from "@/lib/db/queries";
import { persistGhlCallRecord } from "./persistCallRecord";
import { extractGhlPayload, parseBody } from "./extractGhlPayload";

function looksLikeGhlCall(log: WebhookLog): boolean {
  const payload = extractGhlPayload(log.headers ?? {}, log.raw_body);
  // If source is ghl, treat as GHL and require only csr + booking_value
  if (log.source === "ghl") {
    return !!payload.csr.trim() && !!payload.booking_value.trim();
  }
  const hasEvent = (() => {
    try {
      const p = JSON.parse(log.raw_body ?? "{}") as { event?: string };
      return typeof p?.event === "string";
    } catch {
      return false;
    }
  })();
  return !hasEvent && !!payload.csr.trim() && !!payload.booking_value.trim();
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
  const payload = extractGhlPayload(log.headers ?? {}, log.raw_body);

  let rawPayload = parseBody(log.raw_body) as Record<string, unknown>;
  if (Object.keys(rawPayload).length === 0 && log.raw_body) {
    (rawPayload as Record<string, unknown>)._raw = log.raw_body;
  }

  try {
    const result = await persistGhlCallRecord(
      log.organization_id,
      companyId,
      payload,
      rawPayload,
      { callHeaders: log.headers ?? {} }
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
