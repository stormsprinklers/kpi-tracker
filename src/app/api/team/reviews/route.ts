import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getEmployeesAndProsForCsrSelector,
  getGoogleBusinessProfile,
  getGoogleBusinessReviewsByOrg,
  getOrganizationById,
} from "@/lib/db/queries";

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

  const [profile, reviews, candidates] = await Promise.all([
    getGoogleBusinessProfile(session.user.organizationId),
    getGoogleBusinessReviewsByOrg(session.user.organizationId),
    getEmployeesAndProsForCsrSelector(companyId),
  ]);

  return NextResponse.json({ profile, reviews, candidates });
}
