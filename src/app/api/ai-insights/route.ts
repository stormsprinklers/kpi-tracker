import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getAiDashboardInsights } from "@/lib/db/queries";
import type { AiDashboardType } from "@/lib/db/queries";

const VALID_DASHBOARDS: AiDashboardType[] = ["main", "calls", "profit", "time", "marketing"];

/** GET /api/ai-insights?dashboard=main - Fetch cached insights for a dashboard. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dashboard = searchParams.get("dashboard") ?? "main";
  if (!VALID_DASHBOARDS.includes(dashboard as AiDashboardType)) {
    return NextResponse.json({ error: "Invalid dashboard" }, { status: 400 });
  }

  await initSchema();

  try {
    const row = await getAiDashboardInsights(session.user.organizationId, dashboard as AiDashboardType);
    if (!row) {
      return NextResponse.json({ insights: null, generatedAt: null });
    }
    return NextResponse.json({
      insights: row.insights,
      generatedAt: row.generatedAt,
    });
  } catch (error) {
    console.error("[AI Insights GET] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch AI insights",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
