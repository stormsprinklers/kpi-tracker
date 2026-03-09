import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getUserPermissions,
  setUserPermissions,
  getUsersByOrganizationId,
  type UserPermissions,
  type PermissionKey,
} from "@/lib/db/queries";

export async function GET(
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
  const users = await getUsersByOrganizationId(session.user.organizationId);
  if (!users.some((u) => u.id === id)) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const permissions = await getUserPermissions(id);
  return NextResponse.json(permissions);
}

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
  const users = await getUsersByOrganizationId(session.user.organizationId);
  if (!users.some((u) => u.id === id)) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await request.json()) as Partial<Record<PermissionKey, boolean>>;
  const permissions: Partial<UserPermissions> = {};
  const allowedKeys: PermissionKey[] = [
    "dashboard",
    "timesheets",
    "call_insights",
    "time_insights",
    "profit",
    "marketing",
    "performance_pay",
    "users",
    "settings",
    "billing",
    "developer_console",
    "can_edit",
  ];
  for (const k of allowedKeys) {
    if (typeof body[k] === "boolean") permissions[k] = body[k];
  }

  await setUserPermissions(id, permissions);
  const updated = await getUserPermissions(id);
  return NextResponse.json(updated);
}
