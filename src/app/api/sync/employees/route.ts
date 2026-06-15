import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLastSyncAt, getOrganizationById } from "@/lib/db/queries";
import { runEmployeesSync } from "@/lib/sync/hcpSync";

export async function GET() {
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
  const [employeesSync, prosSync] = await Promise.all([
    getLastSyncAt(companyId, "employees"),
    getLastSyncAt(companyId, "pros"),
  ]);

  const timestamps = [employeesSync, prosSync].filter((d): d is Date => d != null);
  const lastSyncAt =
    timestamps.length > 0
      ? new Date(Math.max(...timestamps.map((d) => d.getTime()))).toISOString()
      : null;

  return NextResponse.json({
    companyId,
    lastSyncAt,
    lastEmployeesSyncAt: employeesSync?.toISOString() ?? null,
    lastProsSyncAt: prosSync?.toISOString() ?? null,
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await getOrganizationById(session.user.organizationId);
  if (!org?.hcp_access_token) {
    return NextResponse.json(
      {
        error:
          "Housecall Pro not configured for your organization. Add an access token in Settings.",
      },
      { status: 503 }
    );
  }

  try {
    const result = await runEmployeesSync(session.user.organizationId);
    if (result.status === "error") {
      return NextResponse.json(
        {
          error: "Employee sync failed",
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
        error: "Employee sync failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
