import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { upsertPerformancePayAssignment } from "@/lib/db/queries";

interface AssignmentInput {
  hcpEmployeeId: string;
  roleId: string | null;
  overridden?: boolean;
}

/** PUT /api/performance-pay/assignments - Update employee→role assignments (admin only). */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await initSchema();
  const body = (await request.json()) as { assignments?: AssignmentInput[] };
  const assignments = Array.isArray(body.assignments) ? body.assignments : [];
  if (assignments.length === 0) {
    return NextResponse.json({ error: "assignments array is required" }, { status: 400 });
  }

  for (const a of assignments) {
    const empId = typeof a.hcpEmployeeId === "string" ? a.hcpEmployeeId.trim() : "";
    if (!empId) continue;
    await upsertPerformancePayAssignment(session.user.organizationId, empId, {
      role_id: a.roleId ?? null,
      overridden: a.overridden ?? false,
    });
  }

  return NextResponse.json({ ok: true });
}
