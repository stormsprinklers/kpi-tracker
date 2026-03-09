import { NextResponse } from "next/server";
import { initSchema } from "@/lib/db";
import { getOrganizationsWithTokens } from "@/lib/db/queries";
import { upsertAiDashboardInsights } from "@/lib/db/queries";
import type { AiDashboardType } from "@/lib/db/queries";
import { generateInsights } from "@/lib/ai/openaiInsights";
import { fetchDashboardData } from "@/lib/ai/dashboardData";

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

const DASHBOARDS: AiDashboardType[] = ["main", "calls", "profit", "time", "marketing"];

/** POST /api/cron/ai-insights - Weekly refresh of AI insights for all orgs. Protected by CRON_SECRET. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initSchema();

  const orgs = await getOrganizationsWithTokens();
  if (orgs.length === 0) {
    return NextResponse.json({
      status: "ok",
      message: "No organizations with HCP configured",
      refreshed: [],
    });
  }

  const results: { orgId: string; dashboards: string[]; errors: string[] }[] = [];

  for (const org of orgs) {
    const refreshed: string[] = [];
    const errors: string[] = [];

    for (const dashboard of DASHBOARDS) {
      try {
        const data = await fetchDashboardData(org.id, dashboard);

        if (dashboard === "profit") {
          const staticInsights = [
            "Connect QuickBooks to enable profit insights. P&L and balance sheet data will power recommendations here.",
            "Once QuickBooks is linked, you'll see insights on cost trends, margin improvements, and profitability by service.",
            "Estimated profit levels and cash flow suggestions will appear after financial data is synced.",
          ];
          await upsertAiDashboardInsights(org.id, dashboard, staticInsights);
          refreshed.push(dashboard);
          continue;
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
          await upsertAiDashboardInsights(org.id, dashboard, fallback);
          refreshed.push(dashboard);
          continue;
        }

        const insights = await generateInsights(dashboard, data);
        await upsertAiDashboardInsights(org.id, dashboard, insights);
        refreshed.push(dashboard);
      } catch (err) {
        errors.push(`${dashboard}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    results.push({ orgId: org.id, dashboards: refreshed, errors });
  }

  return NextResponse.json({
    status: "ok",
    refreshed: results.map((r) => ({
      orgId: r.orgId,
      dashboards: r.dashboards,
      errors: r.errors.length > 0 ? r.errors : undefined,
    })),
  });
}
