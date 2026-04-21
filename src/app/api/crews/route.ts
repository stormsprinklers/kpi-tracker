import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { createCrew, getUsersByOrganizationId, listCrewsWithMembers } from "@/lib/db/queries";

function userIdsBelongToOrg(orgId: string, ids: string[], allowed: { id: string }[]): boolean {
  const set = new Set(allowed.map((u) => u.id));
  for (const id of ids) {
    if (!id?.trim() || !set.has(id.trim())) return false;
  }
  return true;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    await initSchema();
    const crews = await listCrewsWithMembers(session.user.organizationId);
    return NextResponse.json({ crews });
  } catch (err) {
    console.error("[crews GET]", err);
    return NextResponse.json({ error: "Failed to list crews" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    foremanUserId?: string;
    memberUserIds?: string[];
  };
  const name = body.name?.trim();
  const foremanUserId = body.foremanUserId?.trim();
  const memberUserIds = Array.isArray(body.memberUserIds) ? body.memberUserIds : [];

  if (!name || !foremanUserId) {
    return NextResponse.json(
      { error: "Crew name and foreman are required" },
      { status: 400 }
    );
  }

  try {
    await initSchema();
    const orgId = session.user.organizationId;
    const orgUsers = await getUsersByOrganizationId(orgId);
    const allIds = [...new Set([foremanUserId, ...memberUserIds.map((x) => String(x).trim())])];
    if (!userIdsBelongToOrg(orgId, allIds, orgUsers)) {
      return NextResponse.json(
        { error: "Foreman and all members must be users in your organization" },
        { status: 400 }
      );
    }

    const { id } = await createCrew({
      organizationId: orgId,
      name,
      foremanUserId,
      memberUserIds: memberUserIds.map((x) => String(x).trim()).filter(Boolean),
    });
    return NextResponse.json({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create crew";
    console.error("[crews POST]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
