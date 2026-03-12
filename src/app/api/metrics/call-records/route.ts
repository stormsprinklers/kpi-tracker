import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCallRecordsForCsr, getCallRecordsForAwaitingAssignment } from "@/lib/db/queries";

/** GET /api/metrics/call-records - Call records for a CSR or awaiting-assignment (for detail view). */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const hcpEmployeeId = searchParams.get("hcpEmployeeId");
  if (!hcpEmployeeId) {
    return NextResponse.json({ error: "hcpEmployeeId required" }, { status: 400 });
  }

  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;
  const filters = { startDate, endDate };

  try {
    const records =
      hcpEmployeeId === "awaiting-assignment"
        ? await getCallRecordsForAwaitingAssignment(session.user.organizationId, filters)
        : await getCallRecordsForCsr(session.user.organizationId, hcpEmployeeId, filters);
    return NextResponse.json({ records });
  } catch (error) {
    console.error("[Call Records] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch call records",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
