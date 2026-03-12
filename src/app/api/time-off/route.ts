import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  createTimeOffRequest,
  getTimeOffRequestsByOrg,
  createNotification,
  getAdminUserIds,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/** POST /api/time-off - Submit time off request (employee only). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hcpEmployeeId = session.user.hcpEmployeeId;
  if (!hcpEmployeeId) {
    return NextResponse.json(
      { error: "Your account is not linked to an employee. Contact your admin." },
      { status: 400 }
    );
  }

  let body: { ranges?: Array<{ startDate: string; endDate: string; startTime?: string | null; endTime?: string | null }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const ranges = Array.isArray(body.ranges)
    ? body.ranges
        .filter(
          (r) =>
            r &&
            typeof r.startDate === "string" &&
            typeof r.endDate === "string" &&
            r.startDate.trim() &&
            r.endDate.trim()
        )
        .slice(0, 20)
    : [];
  if (ranges.length === 0) {
    return NextResponse.json(
      { error: "At least one time range (startDate, endDate) is required" },
      { status: 400 }
    );
  }

  await initSchema();
  const batchId = crypto.randomUUID();
  for (const r of ranges) {
    await createTimeOffRequest({
      organization_id: session.user.organizationId,
      batch_id: batchId,
      hcp_employee_id: hcpEmployeeId,
      start_date: r.startDate.trim(),
      end_date: r.endDate.trim(),
      start_time: r.startTime?.trim() || null,
      end_time: r.endTime?.trim() || null,
    });
  }

  const adminIds = await getAdminUserIds(session.user.organizationId);
  const employeeName = session.user.name ?? session.user.email ?? "An employee";
  for (const adminId of adminIds) {
    await createNotification({
      organization_id: session.user.organizationId,
      user_id: adminId,
      type: "time_off_request",
      data: {
        batchId,
        hcpEmployeeId,
        employeeName,
        ranges: ranges.map((x) => ({
          startDate: x.startDate,
          endDate: x.endDate,
          startTime: x.startTime ?? null,
          endTime: x.endTime ?? null,
        })),
      },
    });
  }

  return NextResponse.json({ ok: true, batchId });
}

/** GET /api/time-off - List time off requests. Admin: all; Employee: own. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;

  await initSchema();
  let rows = await getTimeOffRequestsByOrg(session.user.organizationId, {
    startDate,
    endDate,
  });

  if (session.user.role !== "admin" && session.user.hcpEmployeeId) {
    rows = rows.filter((r) => r.hcp_employee_id === session.user.hcpEmployeeId);
  }

  return NextResponse.json({ requests: rows });
}
