import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSalesmanMetrics } from "@/lib/metrics/salesmanMetrics";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetId =
    searchParams.get("hcpEmployeeId")?.trim() || session.user.hcpEmployeeId?.trim() || "";
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!targetId) {
    return NextResponse.json({ error: "hcpEmployeeId is required" }, { status: 400 });
  }

  if (session.user.role !== "admin" && targetId !== (session.user.hcpEmployeeId?.trim() || "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const metrics = await getSalesmanMetrics(session.user.organizationId, targetId, {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    });
    return NextResponse.json(metrics);
  } catch (error) {
    console.error("[salesman-metrics] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch salesman metrics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
