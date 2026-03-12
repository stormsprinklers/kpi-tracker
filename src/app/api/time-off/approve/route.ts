import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  updateTimeOffRequestBatch,
  getTimeOffRequestsByOrg,
  createNotification,
  getUserIdByHcpEmployeeId,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/** POST /api/time-off/approve - Approve a time-off request batch (admin only). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  let body: { batchId?: string; reason?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const batchId = body?.batchId?.trim();
  if (!batchId) {
    return NextResponse.json({ error: "batchId required" }, { status: 400 });
  }

  await initSchema();
  const rows = await getTimeOffRequestsByOrg(session.user.organizationId);
  const batchRows = rows.filter((r) => r.batch_id === batchId);
  if (batchRows.length === 0) {
    return NextResponse.json({ error: "Request batch not found" }, { status: 404 });
  }

  await updateTimeOffRequestBatch(
    session.user.organizationId,
    batchId,
    "approved",
    body.reason?.trim() || null
  );

  const hcpEmployeeId = batchRows[0].hcp_employee_id;
  const userId = await getUserIdByHcpEmployeeId(session.user.organizationId, hcpEmployeeId);
  if (userId) {
    await createNotification({
      organization_id: session.user.organizationId,
      user_id: userId,
      type: "time_off_response",
      data: {
        batchId,
        status: "approved",
        reason: body.reason?.trim() || null,
        ranges: batchRows.map((r) => ({
          startDate: r.start_date,
          endDate: r.end_date,
          startTime: r.start_time,
          endTime: r.end_time,
        })),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
