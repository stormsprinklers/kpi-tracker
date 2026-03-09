import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrganizationById, getEmployeesForSelector } from "@/lib/db/queries";

/** GET /api/employees - List HCP employees for the org (admin only). Used for timesheet employee selector. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const org = await getOrganizationById(session.user.organizationId);
  if (!org?.hcp_company_id) {
    return NextResponse.json([]);
  }

  const employees = await getEmployeesForSelector(org.hcp_company_id);
  return NextResponse.json(employees);
}
