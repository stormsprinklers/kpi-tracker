import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getOrganizationById, getEmployeesAndProsForCsrSelector, getTechnicianPhotos } from "@/lib/db/queries";

/** GET /api/csr-candidates - Admin-only: list CSR candidates + photo urls. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await initSchema();
  const org = await getOrganizationById(session.user.organizationId);
  const companyId = org?.hcp_company_id ?? "default";
  const candidates = await getEmployeesAndProsForCsrSelector(companyId);
  const ids = candidates.map((c) => c.id);
  const photos = ids.length > 0 ? await getTechnicianPhotos(session.user.organizationId, ids) : {};

  return NextResponse.json({ candidates, photos });
}

