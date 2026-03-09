import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getOrganizationById,
  getCsrSelections,
  setCsrSelections,
  getEmployeesAndProsForCsrSelector,
} from "@/lib/db/queries";

/** GET /api/settings/csr-selections - Current selections + employees/pros for selector (admin only). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await initSchema();
  const org = await getOrganizationById(session.user.organizationId);
  const companyId = org?.hcp_company_id ?? "default";

  const [selections, candidates] = await Promise.all([
    getCsrSelections(session.user.organizationId),
    getEmployeesAndProsForCsrSelector(companyId),
  ]);

  return NextResponse.json({ selections, candidates });
}

/** PUT /api/settings/csr-selections - Replace selections (admin only). */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await initSchema();
  const body = (await request.json()) as { hcpEmployeeIds?: string[] };
  const ids = Array.isArray(body.hcpEmployeeIds)
    ? body.hcpEmployeeIds.filter((x) => typeof x === "string" && x.trim())
    : [];

  await setCsrSelections(session.user.organizationId, ids);
  return NextResponse.json({ ok: true });
}
