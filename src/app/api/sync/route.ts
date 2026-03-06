import { NextResponse } from "next/server";
import { runFullSync } from "@/lib/sync/hcpSync";
import { getCompany } from "@/lib/housecallpro";
import { getLastSyncAt } from "@/lib/db/queries";
import { isConfigured } from "@/lib/housecallpro";

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Housecall Pro not configured" },
      { status: 503 }
    );
  }

  // Vercel cron sends GET with Authorization: Bearer CRON_SECRET
  if (isCronRequest(request)) {
    try {
      const result = await runFullSync();
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

  try {
    const company = (await getCompany()) as { id?: string };
    const companyId = company?.id ?? "default";
    const lastSync = await getLastSyncAt(companyId, "jobs");
    return NextResponse.json({
      companyId,
      lastSyncAt: lastSync?.toISOString() ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to get sync status",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Housecall Pro not configured" },
      { status: 503 }
    );
  }

  try {
    const result = await runFullSync();
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
