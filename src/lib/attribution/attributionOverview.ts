import { initSchema } from "@/lib/db";
import {
  countTwilioCallsBySourceInRange,
  countTwilioTrackingCallsInRange,
  getRecentWebAttributionSessionEvents,
  getTopLandingPagesInRange,
  getWebAttributionRangeTotals,
  getWebSourceMetricsInRange,
} from "@/lib/db/webAttributionQueries";
import type { MarketingOverviewResponse } from "@/lib/marketing/types";
import { buildMarketingOverviewResponse } from "@/lib/metrics/marketingOverview";
import {
  buildRecentWebAttributionSessions,
  type RecentWebAttributionSession,
} from "@/lib/webAttribution/buildSessionPayloads";

export type AttributionOverviewKpis = {
  siteSessions: number;
  calls: number;
  avgCpl: null;
  avgBookingRatePercent: number | null;
  avgConversionRatePercent: number | null;
  avgJobValue: number | null;
  avgCac: null;
  avgRoas: null;
};

export type WebSourceBreakdownRow = {
  source_id: string;
  source_label: string;
  site_sessions: number;
  web_tel_clicks: number;
  tracked_calls: number;
  form_submits: number;
  web_bookings: number;
};

export type AttributionOverviewResponse = {
  startDate: string;
  endDate: string;
  kpis: AttributionOverviewKpis;
  marketingOverview: MarketingOverviewResponse;
  webSourceBreakdown: WebSourceBreakdownRow[];
  websiteTraffic: {
    avgTimeOnSiteSeconds: null;
    totalSiteVisits: number;
    topLandingPages: Array<{ page_url: string; views: number }>;
  };
  recentSessions: RecentWebAttributionSession[];
};

export async function buildAttributionOverviewResponse(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<AttributionOverviewResponse> {
  await initSchema();

  const [
    marketingOverview,
    webTotals,
    webBySource,
    twilioBySource,
    twilioTotal,
    topPages,
    sessionRows,
  ] = await Promise.all([
    buildMarketingOverviewResponse(organizationId, startDate, endDate),
    getWebAttributionRangeTotals({ organizationId, startDate, endDate }),
    getWebSourceMetricsInRange({ organizationId, startDate, endDate }),
    countTwilioCallsBySourceInRange({ organizationId, startDate, endDate }),
    countTwilioTrackingCallsInRange({ organizationId, startDate, endDate }),
    getTopLandingPagesInRange({ organizationId, startDate, endDate, limit: 3 }),
    getRecentWebAttributionSessionEvents({
      organizationId,
      maxVisitors: 40,
      startDate,
      endDate,
    }),
  ]);

  let sumAttributed = 0;
  let sumBooked = 0;
  let sumPaid = 0;
  let sumRevenue = 0;
  for (const c of marketingOverview.channels) {
    sumAttributed += c.attributedJobs;
    sumBooked += c.bookedJobs;
    sumPaid += c.paidJobs;
    sumRevenue += c.totalRevenue;
  }

  const avgBookingRatePercent =
    sumAttributed > 0 ? Math.round((sumBooked / sumAttributed) * 10000) / 100 : null;
  const avgConversionRatePercent =
    sumAttributed > 0 ? Math.round((sumPaid / sumAttributed) * 10000) / 100 : null;
  const avgJobValue =
    sumPaid > 0 ? Math.round((sumRevenue / sumPaid) * 100) / 100 : null;

  const calls = webTotals.telClicks + twilioTotal;

  const webSourceBreakdown: WebSourceBreakdownRow[] = webBySource.map((row) => ({
    source_id: row.source_id,
    source_label: row.source_label,
    site_sessions: row.unique_visitors,
    web_tel_clicks: row.tel_clicks,
    tracked_calls: twilioBySource[row.source_id] ?? 0,
    form_submits: row.form_submits,
    web_bookings: row.web_bookings,
  }));

  const recentSessions = buildRecentWebAttributionSessions(sessionRows);

  return {
    startDate,
    endDate,
    kpis: {
      siteSessions: webTotals.uniqueVisitors,
      calls,
      avgCpl: null,
      avgBookingRatePercent,
      avgConversionRatePercent,
      avgJobValue,
      avgCac: null,
      avgRoas: null,
    },
    marketingOverview,
    webSourceBreakdown,
    websiteTraffic: {
      avgTimeOnSiteSeconds: null,
      /** Same definition as `kpis.siteSessions`: distinct visitors with events in range (not raw page-view count). */
      totalSiteVisits: webTotals.uniqueVisitors,
      topLandingPages: topPages,
    },
    recentSessions,
  };
}
