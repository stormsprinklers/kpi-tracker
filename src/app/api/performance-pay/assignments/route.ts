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
  const body = (await request.json()) as {
    assignments?: AssignmentInput[];
    /** Assign many employees to one role in one request. */
    bulk?: { roleId: string | null; hcpEmployeeIds: string[]; overridden?: boolean };
  };

  const orgId = session.user.organizationId;
  const toWrite: AssignmentInput[] = [];

  if (body.bulk && Array.isArray(body.bulk.hcpEmployeeIds)) {
    const roleId = body.bulk.roleId ?? null;
    const overridden = body.bulk.overridden ?? true;
    for (const raw of body.bulk.hcpEmployeeIds) {
      const empId = typeof raw === "string" ? raw.trim() : "";
      if (empId) toWrite.push({ hcpEmployeeId: empId, roleId, overridden });
    }
  }

  const assignments = Array.isArray(body.assignments) ? body.assignments : [];
  for (const a of assignments) {
    const empId = typeof a.hcpEmployeeId === "string" ? a.hcpEmployeeId.trim() : "";
    if (!empId) continue;
    toWrite.push({
      hcpEmployeeId: empId,
      roleId: a.roleId ?? null,
      overridden: a.overridden ?? true,
    });
  }

  if (toWrite.length === 0) {
    return NextResponse.json({ error: "assignments or bulk is required" }, { status: 400 });
  }

  for (const a of toWrite) {
    await upsertPerformancePayAssignment(orgId, a.hcpEmployeeId, {
      role_id: a.roleId ?? null,
      overridden: a.overridden ?? true,
    });
  }

  return NextResponse.json({ ok: true });
}
