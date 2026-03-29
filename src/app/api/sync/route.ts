import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runTwilioTranscriptPoll } from "@/lib/cron/twilioTranscriptPoll";
import { runFullSync } from "@/lib/sync/hcpSync";
import { getLastSyncAt, getOrganizationsWithTokens, getOrganizationById } from "@/lib/db/queries";

const DASHBOARD_SYNC_MINUTES = 10;

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  // Cron: sync all orgs with tokens
  if (isCronRequest(request)) {
    let twilioTranscripts: { processed: number; updated: number } | { error: string };
    try {
      twilioTranscripts = await runTwilioTranscriptPoll();
    } catch (twilioErr) {
      console.error("[cron /api/sync] Twilio transcript poll", twilioErr);
      twilioTranscripts = {
        error: twilioErr instanceof Error ? twilioErr.message : String(twilioErr),
      };
    }

    try {
      const orgs = await getOrganizationsWithTokens();
      if (orgs.length === 0) {
        return NextResponse.json({
          status: "ok",
          message: "No organizations with HCP configured",
          synced: [],
          twilioTranscripts,
        });
      }
      const results: { orgId: string; result: Awaited<ReturnType<typeof runFullSync>> }[] = [];
      for (const org of orgs) {
        const result = await runFullSync(org.id);
        results.push({ orgId: org.id, result });
      }
      return NextResponse.json({
        status: "ok",
        synced: results.map((r) => ({
          orgId: r.orgId,
          companyId: r.result.companyId,
          status: r.result.status,
          entitiesSynced: r.result.entitiesSynced,
        })),
        twilioTranscripts,
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: "Sync failed",
          details: err instanceof Error ? err.message : String(err),
          twilioTranscripts,
        },
        { status: 500 }
      );
    }
  }

  // Authenticated: return sync status for user's org
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await getOrganizationById(session.user.organizationId);
  if (!org?.hcp_access_token) {
    return NextResponse.json(
      { error: "Housecall Pro not configured for your organization" },
      { status: 503 }
    );
  }

  const companyId = org.hcp_company_id ?? "default";
  const lastSync = await getLastSyncAt(companyId, "jobs");
  return NextResponse.json({
    companyId,
    lastSyncAt: lastSync?.toISOString() ?? null,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await getOrganizationById(session.user.organizationId);
  if (!org?.hcp_access_token) {
    return NextResponse.json(
      { error: "Housecall Pro not configured for your organization. Add an access token in Settings." },
      { status: 503 }
    );
  }

  let body: { force?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    /* optional body */
  }
  const force = body.force === true;

  // Avoid hammering HCP on frequent page loads unless explicitly forced.
  const companyId = org.hcp_company_id ?? "default";
  const lastSync = await getLastSyncAt(companyId, "jobs");
  if (!force && lastSync) {
    const minutesSinceSync = (Date.now() - new Date(lastSync).getTime()) / 60000;
    if (minutesSinceSync < DASHBOARD_SYNC_MINUTES) {
      return NextResponse.json({
        status: "skipped",
        reason: "recent_sync",
        companyId,
        lastSyncAt: lastSync.toISOString(),
      });
    }
  }

  try {
    const result = await runFullSync(session.user.organizationId);
    if (result.status === "error") {
      return NextResponse.json(
        {
          error: "Sync failed",
          details: result.error,
          entitiesSynced: result.entitiesSynced,
          duration: result.duration,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({
      status: result.status,
      companyId: result.companyId,
      entitiesSynced: result.entitiesSynced,
      duration: result.duration,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Sync failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
