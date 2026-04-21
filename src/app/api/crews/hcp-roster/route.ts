import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getEmployeesAndProsForCsrSelector, getOrganizationById } from "@/lib/db/queries";

/** Employees + pros synced from Housecall Pro (for crew foreman / member pickers). */
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
    const org = await getOrganizationById(session.user.organizationId);
    const companyId = org?.hcp_company_id?.trim();
    if (!companyId) {
      return NextResponse.json({ employees: [] as { id: string; name: string }[] });
    }
    const employees = await getEmployeesAndProsForCsrSelector(companyId);
    return NextResponse.json({ employees });
  } catch (err) {
    console.error("[crews/hcp-roster]", err);
    return NextResponse.json({ error: "Failed to load employees" }, { status: 500 });
  }
}
