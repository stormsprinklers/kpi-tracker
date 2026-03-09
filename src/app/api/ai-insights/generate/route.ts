import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { upsertAiDashboardInsights } from "@/lib/db/queries";
import type { AiDashboardType } from "@/lib/db/queries";
import { generateInsights } from "@/lib/ai/openaiInsights";
import { fetchDashboardData } from "@/lib/ai/dashboardData";

const VALID_DASHBOARDS: AiDashboardType[] = ["main", "calls", "profit", "time", "marketing"];

/** POST /api/ai-insights/generate - Generate and store AI insights for a dashboard. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { dashboard?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body ok */
  }
  const dashboard = (body.dashboard ?? "main") as AiDashboardType;
  if (!VALID_DASHBOARDS.includes(dashboard)) {
    return NextResponse.json({ error: "Invalid dashboard" }, { status: 400 });
  }

  await initSchema();

  try {
    const data = await fetchDashboardData(session.user.organizationId, dashboard);

    if (dashboard === "profit") {
      const staticInsights = [
        "Connect QuickBooks to enable profit insights. P&L and balance sheet data will power recommendations here.",
        "Once QuickBooks is linked, you'll see insights on cost trends, margin improvements, and profitability by service.",
        "Estimated profit levels and cash flow suggestions will appear after financial data is synced.",
      ];
      await upsertAiDashboardInsights(session.user.organizationId, dashboard, staticInsights);
      return NextResponse.json({
        insights: staticInsights,
        generatedAt: new Date().toISOString(),
      });
    }

    const payload = data as Record<string, unknown>;
    const summary = payload.summary as Record<string, unknown> | undefined;
    const hasSubstantiveData =
      payload.technicians ||
      payload.byEmployee ||
      payload.seo ||
      payload.avgJobsPerDayPerTechnician ||
      (summary && (summary.jobCount as number) > 0);
    if (payload.message && typeof payload.message === "string" && !hasSubstantiveData) {
      const fallback = [
        payload.message,
        "Generate insights once you have at least 7 days of data in this dashboard.",
        "Check Settings to ensure data sources (HCP, GHL, etc.) are connected.",
      ];
      await upsertAiDashboardInsights(session.user.organizationId, dashboard, fallback);
      return NextResponse.json({
        insights: fallback,
        generatedAt: new Date().toISOString(),
      });
    }

    const insights = await generateInsights(dashboard, data);
    await upsertAiDashboardInsights(session.user.organizationId, dashboard, insights);

    return NextResponse.json({
      insights,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[AI Insights Generate] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate AI insights",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
