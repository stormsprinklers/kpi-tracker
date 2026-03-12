import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrganizationById, getEmployeesAndProsForCsrSelector, getTechnicianPhotos } from "@/lib/db/queries";

/** GET /api/me - Current user profile (displayName, photoUrl for employees). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hcpEmployeeId = session.user.hcpEmployeeId;
  if (!hcpEmployeeId) {
    return NextResponse.json({ displayName: null, photoUrl: null });
  }

  const org = await getOrganizationById(session.user.organizationId);
  const companyId = org?.hcp_company_id ?? "default";
  const candidates = await getEmployeesAndProsForCsrSelector(companyId);
  const emp = candidates.find((c) => c.id === hcpEmployeeId);
  const displayName = emp?.name ?? null;

  const photos = await getTechnicianPhotos(session.user.organizationId, [hcpEmployeeId]);
  const photoUrl = photos[hcpEmployeeId] ?? null;

  return NextResponse.json({ displayName, photoUrl });
}
