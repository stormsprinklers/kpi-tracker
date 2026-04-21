import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { createCrew, listCrewsWithMembers } from "@/lib/db/queries";

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
    foremanHcpEmployeeId?: string;
    memberHcpEmployeeIds?: string[];
  };
  const name = body.name?.trim();
  const foremanHcpEmployeeId = body.foremanHcpEmployeeId?.trim();
  const memberHcpEmployeeIds = Array.isArray(body.memberHcpEmployeeIds) ? body.memberHcpEmployeeIds : [];

  if (!name || !foremanHcpEmployeeId) {
    return NextResponse.json(
      { error: "Crew name and foreman (employee) are required" },
      { status: 400 }
    );
  }

  try {
    await initSchema();
    const { id } = await createCrew({
      organizationId: session.user.organizationId,
      name,
      foremanHcpEmployeeId,
      memberHcpEmployeeIds: memberHcpEmployeeIds.map((x) => String(x).trim()).filter(Boolean),
    });
    return NextResponse.json({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create crew";
    console.error("[crews POST]", err);
    const status = msg.includes("not a synced") || msg.includes("Connect Housecall") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
