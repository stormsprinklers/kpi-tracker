import { getKeyMetrics } from "../metrics/keyMetrics";
import { getTechnicianRevenue } from "../metrics/technicianRevenue";
import { getCsrKpiList } from "../metrics/csrKpis";
import { getCallInsights } from "../metrics/callInsights";
import { getTimeInsights } from "../metrics/timeInsights";
import type { DashboardType } from "./openaiInsights";

function getLast30Days(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function fetchDashboardData(
  organizationId: string,
  dashboardType: DashboardType
): Promise<unknown> {
  const { startDate, endDate } = getLast30Days();

  switch (dashboardType) {
    case "main": {
      const [keyMetrics, techResult, csrKpis] = await Promise.all([
        getKeyMetrics(organizationId, "30d"),
        getTechnicianRevenue(organizationId, {
          startDate,
          endDate,
          activeInCurrentYearOnly: false,
        }),
        getCsrKpiList(organizationId, { startDate, endDate }),
      ]);
      return {
        summary: {
          jobCount: keyMetrics.jobCount,
          revenue: keyMetrics.revenue,
          avgJobValue: keyMetrics.avgJobValue,
          conversionRate: keyMetrics.conversionRate,
        },
        technicians: techResult.technicians.map((t) => ({
          name: t.technicianName,
          totalRevenue: t.totalRevenue,
          revenuePerHour: t.revenuePerHour,
          conversionRate: t.conversionRate,
        })),
        csrs: csrKpis.map((c) => ({
          name: c.csrName,
          bookingRate: c.bookingRate,
          avgCallDurationMinutes: c.avgCallDurationMinutes,
          avgBookedCallRevenue: c.avgBookedCallRevenue,
        })),
      };
    }

    case "calls": {
      const callInsights = await getCallInsights(organizationId, { startDate, endDate });
      return {
        avgWaitingWindowDays: callInsights.avgWaitingWindowDays,
        byEmployee: callInsights.byEmployee.map((e) => ({
          name: e.employeeName,
          opportunityCalls: e.totalOpportunityCalls,
          won: e.won,
          lost: e.lost,
          bookingRatePercent: e.bookingRatePercent,
          avgDurationSeconds: e.avgDurationSeconds,
          avgBookedCallRevenue: e.avgBookedCallRevenue,
        })),
      };
    }

    case "time": {
      const timeInsights = await getTimeInsights(organizationId, { startDate, endDate });
      return {
        avgJobsPerDayPerTechnician: timeInsights.averageJobsPerDayPerTechnician.map((t) => ({
          name: t.technicianName,
          avgJobsPerDay: t.avgJobsPerDay,
        })),
        avgDriveTimeMinutes: timeInsights.averageDriveTimeMinutes,
        avgLaborTimeMinutes: timeInsights.averageLaborTimeMinutes,
        avgRevenuePerJob: timeInsights.averageRevenuePerJob,
        avgRevenuePerOnJobHour: timeInsights.averageRevenuePerOnJobHour,
        avgRevenuePerLoggedHour: timeInsights.averageRevenuePerLoggedHour,
        laborPercentOfRevenue: timeInsights.laborPercentOfRevenue,
      };
    }

    case "profit":
      return {
        message: "Connect QuickBooks to enable profit insights. No profit data available yet.",
      };

    case "marketing": {
      const { createHash } = await import("crypto");
      const { getOrganizationById, getSeoConfig, getSeoServiceAreas, getLatestSeoResults } =
        await import("../db/queries");
      const org = await getOrganizationById(organizationId);
      const seoConfig = await getSeoConfig(organizationId);
      const serviceAreas = await getSeoServiceAreas(organizationId);
      const website = org?.website?.trim();
      const keywords = seoConfig.keywords.filter(Boolean);
      const locationValues = seoConfig.locations.filter(Boolean);
      const hasConfig = website && keywords.length > 0 && locationValues.length > 0;
      if (!hasConfig) {
        return {
          message: "Marketing: Add website, keywords, and locations in Settings → Marketing & SEO to enable insights.",
        };
      }
      const parts = [
        (website ?? "").toLowerCase().trim(),
        [...keywords].sort().join("|"),
        [...locationValues].sort().join("|"),
        ...serviceAreas.map((a) => `${a.name}:${[...a.location_values].sort().join(",")}`).sort(),
      ];
      const fingerprint = createHash("sha256").update(parts.join("::")).digest("hex");
      const cached = await getLatestSeoResults(organizationId, fingerprint);
      if (cached?.payload) {
        const p = cached.payload as { organic?: unknown[]; local?: unknown[]; ai?: unknown[] };
        return {
          seo: {
            organic: (p.organic ?? []).slice(0, 10),
            local: (p.local ?? []).slice(0, 10),
            ai: (p.ai ?? []).slice(0, 10),
          },
        };
      }
      return {
        message: "Marketing: SEO data not yet loaded. Run a refresh in Marketing dashboard to populate.",
      };
    }

    default:
      return {};
  }
}
