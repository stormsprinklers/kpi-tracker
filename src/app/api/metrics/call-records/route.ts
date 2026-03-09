import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCallRecordsForCsr } from "@/lib/db/queries";

/** GET /api/metrics/call-records - Call records for a CSR (for detail view). */
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

  try {
    const records = await getCallRecordsForCsr(session.user.organizationId, hcpEmployeeId, {
      startDate,
      endDate,
    });
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
