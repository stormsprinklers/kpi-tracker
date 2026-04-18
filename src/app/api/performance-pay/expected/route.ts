import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getPerformancePayOrg } from "@/lib/db/queries";
import { payPeriodSettingsFromOrg } from "@/lib/payPeriod";
import { getBiweeklyPeriod, calculateExpectedPay } from "@/lib/performancePay";

/** GET /api/performance-pay/expected - Expected pay. Employee: own only. Admin: all with configs, filterable by date. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initSchema();

  const { searchParams } = new URL(request.url);
  let startDate = searchParams.get("startDate") ?? undefined;
  let endDate = searchParams.get("endDate") ?? undefined;
  const hcpEmployeeId = searchParams.get("hcpEmployeeId") ?? undefined;

  const isAdmin = session.user.role === "admin";
  const includeTimesheetEmployees =
    isAdmin &&
    (searchParams.get("includeTimesheetEmployees") === "1" ||
      searchParams.get("includeTimesheetEmployees") === "true");

  if (!isAdmin) {
    const empId = session.user.hcpEmployeeId ?? null;
    if (!empId) {
      return NextResponse.json(
        { error: "Your account is not linked to an HCP employee." },
        { status: 403 }
      );
    }
  }

  if (!startDate || !endDate) {
    const ppOrg = await getPerformancePayOrg(session.user.organizationId);
    const cal = payPeriodSettingsFromOrg(ppOrg);
    [startDate, endDate] = getBiweeklyPeriod(new Date(), cal);
  }

  try {
    const results = await calculateExpectedPay({
      organizationId: session.user.organizationId,
      startDate,
      endDate,
      hcpEmployeeId: isAdmin ? hcpEmployeeId : session.user.hcpEmployeeId ?? undefined,
      includeTimesheetEmployeesWithoutPayConfig: includeTimesheetEmployees,
    });

    return NextResponse.json({
      results,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error("[Performance Pay Expected] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to calculate expected pay",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
