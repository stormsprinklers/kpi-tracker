import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { deleteCrew, updateCrew } from "@/lib/db/queries";

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
    foremanHcpEmployeeId?: string;
    memberHcpEmployeeIds?: string[];
  };

  try {
    await initSchema();
    await updateCrew(crewId, session.user.organizationId, {
      name: body.name,
      foremanHcpEmployeeId: body.foremanHcpEmployeeId?.trim(),
      memberHcpEmployeeIds: body.memberHcpEmployeeIds,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    const status = msg === "Crew not found" ? 404 : msg.includes("not a synced") || msg.includes("Connect Housecall") ? 400 : 500;
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
