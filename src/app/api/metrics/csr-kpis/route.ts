import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getCsrKpiList } from "@/lib/metrics/csrKpis";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initSchema();

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;

  try {
    const csrList = await getCsrKpiList(session.user.organizationId, {
      startDate,
      endDate,
    });
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
