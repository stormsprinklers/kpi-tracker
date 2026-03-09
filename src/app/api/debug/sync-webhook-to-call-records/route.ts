import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrganizationById, getWebhookLogById } from "@/lib/db/queries";
import { syncWebhookLogToCallRecords } from "@/lib/ghl/syncWebhookLogToCallRecords";

/**
 * POST /api/debug/sync-webhook-to-call-records
 * Re-process selected webhook log entries into call_records.
 * Body: { webhookLogIds: string[] }
 * Returns: { results: SyncResult[], ok: boolean }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  let body: { webhookLogIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.webhookLogIds)
    ? body.webhookLogIds.filter((x): x is string => typeof x === "string").slice(0, 20)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "webhookLogIds array required (max 20)" }, { status: 400 });
  }

  const org = await getOrganizationById(organizationId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const results: Awaited<ReturnType<typeof syncWebhookLogToCallRecords>>[] = [];
  for (const id of ids) {
    const log = await getWebhookLogById(organizationId, id);
    if (!log) {
      results.push({
        ok: false,
        webhookLogId: id,
        synced: false,
        error: "Webhook log not found",
      });
      continue;
    }
    if (log.organization_id !== organizationId) {
      results.push({
        ok: false,
        webhookLogId: id,
        synced: false,
        error: "Forbidden",
      });
      continue;
    }
    const result = await syncWebhookLogToCallRecords(log, org);
    results.push(result);
  }

  const ok = results.every((r) => r.ok);
  return NextResponse.json({ results, ok });
}
