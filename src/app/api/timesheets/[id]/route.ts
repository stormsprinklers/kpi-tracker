import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getTimeEntriesByEmployee,
  updateTimeEntry,
  deleteTimeEntry,
} from "@/lib/db/queries";
import { initSchema } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hcpEmployeeId = session.user.hcpEmployeeId;
  if (!hcpEmployeeId) {
    return NextResponse.json(
      { error: "Your account is not linked to an HCP employee. Contact your admin." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = (await request.json()) as {
    entry_date?: string;
    start_time?: string | null;
    end_time?: string | null;
    hours?: number | null;
    job_hcp_id?: string | null;
    notes?: string | null;
  };

  await initSchema();
  const updated = await updateTimeEntry(
    id,
    session.user.organizationId,
    hcpEmployeeId,
    body
  );
  if (!updated) {
    return NextResponse.json({ error: "Time entry not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hcpEmployeeId = session.user.hcpEmployeeId;
  if (!hcpEmployeeId) {
    return NextResponse.json(
      { error: "Your account is not linked to an HCP employee. Contact your admin." },
      { status: 403 }
    );
  }

  const { id } = await params;
  await initSchema();
  const deleted = await deleteTimeEntry(
    id,
    session.user.organizationId,
    hcpEmployeeId
  );
  if (!deleted) {
    return NextResponse.json({ error: "Time entry not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
