import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { deleteCrew, getUsersByOrganizationId, updateCrew } from "@/lib/db/queries";

function userIdsBelongToOrg(ids: string[], allowed: { id: string }[]): boolean {
  const set = new Set(allowed.map((u) => u.id));
  for (const id of ids) {
    if (!id?.trim() || !set.has(id.trim())) return false;
  }
  return true;
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id: crewId } = await ctx.params;
  if (!crewId) {
    return NextResponse.json({ error: "Missing crew id" }, { status: 400 });
  }

  const body = (await request.json()) as {
    name?: string;
    foremanUserId?: string;
    memberUserIds?: string[];
  };

  try {
    await initSchema();
    const orgId = session.user.organizationId;
    const orgUsers = await getUsersByOrganizationId(orgId);

    const idsToCheck: string[] = [];
    if (body.foremanUserId) idsToCheck.push(body.foremanUserId.trim());
    if (body.memberUserIds) idsToCheck.push(...body.memberUserIds.map((x) => String(x).trim()).filter(Boolean));
    const unique = [...new Set(idsToCheck)];
    if (unique.length > 0 && !userIdsBelongToOrg(unique, orgUsers)) {
      return NextResponse.json(
        { error: "Foreman and all members must be users in your organization" },
        { status: 400 }
      );
    }

    await updateCrew(crewId, orgId, {
      name: body.name,
      foremanUserId: body.foremanUserId?.trim(),
      memberUserIds: body.memberUserIds,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    const status = msg === "Crew not found" ? 404 : 500;
    console.error("[crews PATCH]", err);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id: crewId } = await ctx.params;
  if (!crewId) {
    return NextResponse.json({ error: "Missing crew id" }, { status: 400 });
  }

  try {
    await initSchema();
    const ok = await deleteCrew(crewId, session.user.organizationId);
    if (!ok) return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[crews DELETE]", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
