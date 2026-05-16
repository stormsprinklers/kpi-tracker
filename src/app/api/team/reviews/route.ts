import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getEmployeesAndProsForCsrSelector,
  getGoogleBusinessProfile,
  getGoogleBusinessReviewsByOrg,
  getOrganizationById,
} from "@/lib/db/queries";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rangeAll = searchParams.get("range") === "all";
  const startDate = searchParams.get("startDate")?.trim();
  const endDate = searchParams.get("endDate")?.trim();

  const reviewFilters =
    rangeAll || (!startDate && !endDate)
      ? undefined
      : startDate && endDate
        ? { startDate, endDate }
        : null;

  await initSchema();
  const org = await getOrganizationById(session.user.organizationId);
  const companyId = org?.hcp_company_id ?? "default";

  const [profile, reviews, candidates] = await Promise.all([
    getGoogleBusinessProfile(session.user.organizationId),
    reviewFilters === null
      ? Promise.resolve([])
      : getGoogleBusinessReviewsByOrg(
          session.user.organizationId,
          reviewFilters === undefined ? undefined : reviewFilters
        ),
    getEmployeesAndProsForCsrSelector(companyId),
  ]);

  return NextResponse.json({ profile, reviews, candidates });
}
