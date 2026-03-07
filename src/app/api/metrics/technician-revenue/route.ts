import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTechnicianRevenue } from "@/lib/metrics/technicianRevenue";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;
  const filters = (startDate || endDate) ? { startDate, endDate } : undefined;

  try {
    const result = await getTechnicianRevenue(session.user.organizationId, filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Technician Revenue] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch technician revenue",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
