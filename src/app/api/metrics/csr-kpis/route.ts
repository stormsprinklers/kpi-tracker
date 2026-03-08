import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCsrKpiList } from "@/lib/metrics/csrKpis";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const csrList = await getCsrKpiList(session.user.organizationId);
    return NextResponse.json(csrList);
  } catch (error) {
    console.error("[CSR KPIs] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch CSR KPIs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
