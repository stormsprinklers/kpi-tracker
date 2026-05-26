import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  deleteUser,
  getOrganizationById,
  getEmployeeHcpIdByEmail,
  getUsersByOrganizationId,
  updateUserRole,
} from "@/lib/db/queries";
import { isAppUserRole, type AppUserRole } from "@/lib/userRoles";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "You cannot change your own role" },
      { status: 400 }
    );
  }

  const orgUsers = await getUsersByOrganizationId(session.user.organizationId);
  const target = orgUsers.find((u) => u.id === id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await request.json()) as { role?: string };
  const roleRaw = body.role?.trim();
  if (!roleRaw || !isAppUserRole(roleRaw)) {
    return NextResponse.json(
      { error: "Role must be admin, employee, salesperson, or investor" },
      { status: 400 }
    );
  }
  const role = roleRaw as AppUserRole;

  let hcpEmployeeId: string | null = null;
  if (role === "employee" || role === "salesman") {
    const org = await getOrganizationById(session.user.organizationId);
    if (org?.hcp_company_id) {
      hcpEmployeeId = await getEmployeeHcpIdByEmail(org.hcp_company_id, target.email);
    }
    if (!hcpEmployeeId && target.hcp_employee_id) {
      hcpEmployeeId = target.hcp_employee_id;
    }
  }

  const updated = await updateUserRole(id, session.user.organizationId, role, hcpEmployeeId);
  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    role: updated.role,
    hcp_employee_id: updated.hcp_employee_id,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "You cannot remove yourself" },
      { status: 400 }
    );
  }

  await deleteUser(id, session.user.organizationId);
  return NextResponse.json({ success: true });
}
