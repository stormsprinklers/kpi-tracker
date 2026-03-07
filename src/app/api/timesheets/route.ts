import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getTimeEntriesByEmployee,
  createTimeEntry,
} from "@/lib/db/queries";
import { initSchema } from "@/lib/db";

/** GET /api/timesheets - List time entries for the logged-in employee (requires hcpEmployeeId) */
export async function GET(request: Request) {
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

  await initSchema();
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start_date") ?? undefined;
  const endDate = searchParams.get("end_date") ?? undefined;

  const entries = await getTimeEntriesByEmployee(
    session.user.organizationId,
    hcpEmployeeId,
    startDate,
    endDate
  );
  return NextResponse.json(entries);
}

/** POST /api/timesheets - Create a time entry (employee only, linked to their HCP employee) */
export async function POST(request: Request) {
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

  const body = (await request.json()) as {
    entry_date?: string;
    start_time?: string | null;
    end_time?: string | null;
    hours?: number | null;
    job_hcp_id?: string | null;
    notes?: string | null;
  };

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
