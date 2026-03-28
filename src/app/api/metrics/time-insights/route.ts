import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTimeInsights } from "@/lib/metrics/timeInsights";

/**
 * GET /api/metrics/time-insights
 * Query params: startDate, endDate (optional, ISO YYYY-MM-DD)
 * Returns: averageJobsPerDayPerTechnician, averageDriveTimeMinutes, averageLaborTimeMinutes,
 *          averageRevenuePerJob, averageRevenuePerOnJobHour, averageRevenuePerLoggedHour,
 *          laborPercentOfRevenue (field/tech expected pay ÷ attributed tech revenue; excludes CSR booking-rate pay)
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;

  try {
    const result = await getTimeInsights(session.user.organizationId, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Time Insights] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch time insights",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
