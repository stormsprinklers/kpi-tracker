import { getKeyMetrics } from "@/lib/metrics/keyMetrics";
import { getCallInsights } from "@/lib/metrics/callInsights";
import { getTechnicianRevenue } from "@/lib/metrics/technicianRevenue";
import { getCsrKpiList } from "@/lib/metrics/csrKpis";
import { getTimeInsights } from "@/lib/metrics/timeInsights";
import { getOrganizationById } from "@/lib/db/queries";

function summarizeCalls(callInsights: Awaited<ReturnType<typeof getCallInsights>>) {
  let opportunity = 0;
  let won = 0;
  let lost = 0;
  for (const e of callInsights.byEmployee) {
    opportunity += e.totalOpportunityCalls;
    won += e.won;
    lost += e.lost;
  }
  const bookingDenom = won + lost;
  const bookingRate = bookingDenom > 0 ? (won / bookingDenom) * 100 : null;
  return {
    opportunityCalls: opportunity,
    won,
    lost,
    bookingRatePercent: bookingRate,
    avgWaitingWindowDays: callInsights.avgWaitingWindowDays,
  };
}

export type PulseDailySnapshot = {
  kind: "daily";
  dateYmd: string;
  dataGaps: string[];
  keyMetrics: Awaited<ReturnType<typeof getKeyMetrics>>;
  callSummary: ReturnType<typeof summarizeCalls>;
};

export async function buildPulseDailySnapshot(organizationId: string, dateYmd: string): Promise<PulseDailySnapshot> {
  const org = await getOrganizationById(organizationId);
  const dataGaps: string[] = [];
  if (!org?.hcp_company_id?.trim()) {
    dataGaps.push("Housecall Pro is not connected; job and revenue metrics may be empty.");
  }

  const [keyMetrics, callInsights] = await Promise.all([
    getKeyMetrics(organizationId, { startDate: dateYmd, endDate: dateYmd }),
    getCallInsights(organizationId, { startDate: dateYmd, endDate: dateYmd }),
  ]);

  return {
    kind: "daily",
    dateYmd,
    dataGaps,
    keyMetrics,
    callSummary: summarizeCalls(callInsights),
  };
}

export type PulseWeeklySnapshot = {
  kind: "weekly";
  startDate: string;
  endDate: string;
  dataGaps: string[];
  keyMetrics: Awaited<ReturnType<typeof getKeyMetrics>>;
  callSummary: ReturnType<typeof summarizeCalls>;
  techniciansSample: { name: string; totalRevenue: number; revenuePerHour: number | null }[];
  csrsSample: { name: string; bookingRate: number | null; avgCallDurationMinutes: number | null }[];
  timeSummary: {
    avgDriveTimeMinutes: number | null;
    avgLaborTimeMinutes: number | null;
    laborPercentOfRevenue: number | null;
  } | null;
  marketingSnippet: unknown;
};

export async function buildPulseWeeklySnapshot(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<PulseWeeklySnapshot> {
  const org = await getOrganizationById(organizationId);
  const dataGaps: string[] = [];
  if (!org?.hcp_company_id?.trim()) {
    dataGaps.push("Housecall Pro is not connected; job and revenue metrics may be empty.");
  }

  const [keyMetrics, callInsights, techResult, csrKpis, timeInsights] = await Promise.all([
    getKeyMetrics(organizationId, { startDate, endDate }),
    getCallInsights(organizationId, { startDate, endDate }),
    getTechnicianRevenue(organizationId, {
      startDate,
      endDate,
      activeInCurrentYearOnly: false,
    }),
    getCsrKpiList(organizationId, { startDate, endDate }),
    getTimeInsights(organizationId, { startDate, endDate }),
  ]);

  let marketingSnippet: unknown = null;
  try {
    const { buildMarketingAiContext } = await import("@/lib/metrics/marketingOverview");
    marketingSnippet = await buildMarketingAiContext(organizationId, startDate, endDate);
  } catch {
    dataGaps.push("Marketing / attribution context could not be loaded for this period.");
  }

  return {
    kind: "weekly",
    startDate,
    endDate,
    dataGaps,
    keyMetrics,
    callSummary: summarizeCalls(callInsights),
    techniciansSample: techResult.technicians.slice(0, 8).map((t) => ({
      name: t.technicianName,
      totalRevenue: t.totalRevenue,
      revenuePerHour: t.revenuePerHour,
    })),
    csrsSample: csrKpis.slice(0, 8).map((c) => ({
      name: c.csrName,
      bookingRate: c.bookingRate,
      avgCallDurationMinutes: c.avgCallDurationMinutes,
    })),
    timeSummary: {
      avgDriveTimeMinutes: timeInsights.averageDriveTimeMinutes,
      avgLaborTimeMinutes: timeInsights.averageLaborTimeMinutes,
      laborPercentOfRevenue: timeInsights.laborPercentOfRevenue,
    },
    marketingSnippet,
  };
}
