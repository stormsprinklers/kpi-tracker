import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getTimesheetImportNameMappings,
  upsertTimesheetImportNameMapping,
} from "@/lib/db/queries";

/** GET /api/timesheets/import-mappings - Admin-only: list csv-name mappings. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await initSchema();
  const mappings = await getTimesheetImportNameMappings(session.user.organizationId);
  return NextResponse.json({ mappings });
}

/** POST /api/timesheets/import-mappings - Admin-only: upsert mapping. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: { csvName?: string; hcpEmployeeId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const csvName = body.csvName?.trim();
  const hcpEmployeeId = body.hcpEmployeeId?.trim();
  if (!csvName || !hcpEmployeeId) {
    return NextResponse.json({ error: "csvName and hcpEmployeeId are required" }, { status: 400 });
  }

  await initSchema();
  await upsertTimesheetImportNameMapping({
    organization_id: session.user.organizationId,
    csv_name: csvName,
    hcp_employee_id: hcpEmployeeId,
  });
  return NextResponse.json({ ok: true });
}

