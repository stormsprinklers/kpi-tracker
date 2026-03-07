import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runFullSync } from "@/lib/sync/hcpSync";
import { getLastSyncAt, getOrganizationsWithTokens, getOrganizationById } from "@/lib/db/queries";

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  // Cron: sync all orgs with tokens
  if (isCronRequest(request)) {
    try {
      const orgs = await getOrganizationsWithTokens();
      if (orgs.length === 0) {
        return NextResponse.json({
          status: "ok",
          message: "No organizations with HCP configured",
          synced: [],
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

  // Authenticated: return sync status for user's org
  const session = await getServerSession(authOptions);
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
  const session = await getServerSession(authOptions);
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
