import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getTimeEntriesByOrganization,
  createTimeEntry,
} from "@/lib/db/queries";
import { initSchema } from "@/lib/db";

/** GET /api/timesheets - Admin only (org-wide; omit dates for all-time range). */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start_date") ?? undefined;
  const endDate = searchParams.get("end_date") ?? undefined;

  await initSchema();
  const entries = await getTimeEntriesByOrganization(
    session.user.organizationId,
    startDate,
    endDate
  );
  return NextResponse.json(entries);
}

/** POST /api/timesheets - Admin only. hcp_employee_id in body is required. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = (await request.json()) as {
    hcp_employee_id?: string | null;
    entry_date?: string;
    start_time?: string | null;
    end_time?: string | null;
    hours?: number | null;
    job_hcp_id?: string | null;
    notes?: string | null;
  };

  const hcpEmployeeId = body.hcp_employee_id?.trim() || null;

  if (!hcpEmployeeId) {
    return NextResponse.json(
      { error: "hcp_employee_id is required in request body for admin" },
      { status: 403 }
    );
  }

  const entryDate = body.entry_date?.trim();
  if (!entryDate) {
    return NextResponse.json(
      { error: "entry_date is required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  await initSchema();
  const entry = await createTimeEntry({
    organization_id: session.user.organizationId,
    hcp_employee_id: hcpEmployeeId,
    entry_date: entryDate,
    start_time: body.start_time ?? null,
    end_time: body.end_time ?? null,
    hours: body.hours ?? null,
    job_hcp_id: body.job_hcp_id ?? null,
    notes: body.notes ?? null,
  });
  return NextResponse.json(entry);
}
