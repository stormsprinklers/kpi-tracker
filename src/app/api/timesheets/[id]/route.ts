import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  updateTimeEntryForAdmin,
  deleteTimeEntryForAdmin,
} from "@/lib/db/queries";
import { initSchema } from "@/lib/db";

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
  const body = (await request.json()) as {
    entry_date?: string;
    start_time?: string | null;
    end_time?: string | null;
    hours?: number | null;
    job_hcp_id?: string | null;
    notes?: string | null;
  };

  await initSchema();
  const updated = await updateTimeEntryForAdmin(id, session.user.organizationId, body);
  if (!updated) {
    return NextResponse.json({ error: "Time entry not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
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
  await initSchema();
  const deleted = await deleteTimeEntryForAdmin(id, session.user.organizationId);
  if (!deleted) {
    return NextResponse.json({ error: "Time entry not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
