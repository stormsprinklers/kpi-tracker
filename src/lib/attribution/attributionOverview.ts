import { initSchema } from "@/lib/db";
import {
  countTwilioCallsBySourceInRange,
  countTwilioTrackingCallsInRange,
  getWebAttributionDailySeries,
  getRecentWebAttributionSessionEvents,
  getTopLandingPagesInRange,
  getWebAttributionRangeTotals,
  getWebSourceMetricsInRange,
} from "@/lib/db/webAttributionQueries";
import type { MarketingOverviewResponse } from "@/lib/marketing/types";
import { buildMarketingOverviewResponse } from "@/lib/metrics/marketingOverview";
import { getGbpMetricsDailyInRange } from "@/lib/db/marketingQueries";
import { syncGbpPerformanceMetricsForOrganization } from "@/lib/marketing/gbpPerformanceSync";
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
    daily: Array<{
      date: string;
      visitors: number;
      pageViews: number;
      forms: number;
      phoneClicks: number;
      bookings: number;
    }>;
  };
  gbpInsights: {
    metrics: {
      queriesDirect: number | null;
      queriesIndirect: number | null;
      viewsMaps: number;
      viewsSearch: number;
      actionsWebsite: number;
      actionsPhone: number;
      actionsDirections: number;
    };
    daily: Array<{
      date: string;
      viewsMaps: number;
      viewsSearch: number;
      actionsWebsite: number;
      actionsPhone: number;
      actionsDirections: number;
    }>;
  };
  recentSessions: RecentWebAttributionSession[];
};

export async function buildAttributionOverviewResponse(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<AttributionOverviewResponse> {
  await initSchema();
  let liveGbpDaily:
    | Array<{
        metric_date: string;
        views_maps: number;
        views_search: number;
        actions_website: number;
        actions_phone: number;
        actions_directions: number;
      }>
    | null = null;
  let liveQueriesDirect: number | null = null;
  let liveQueriesIndirect: number | null = null;
  try {
    const synced = await syncGbpPerformanceMetricsForOrganization(
      organizationId,
      startDate,
      endDate
    );
    if (synced.ok && Array.isArray(synced.daily)) {
      liveGbpDaily = synced.daily;
      liveQueriesDirect = synced.queriesDirect ?? null;
      liveQueriesIndirect = synced.queriesIndirect ?? null;
    }
  } catch {
    // Keep attribution page resilient if live GBP call fails.
  }

  const [
    marketingOverview,
    webTotals,
    webBySource,
    twilioBySource,
    twilioTotal,
    topPages,
    webDaily,
    dbGbpDaily,
    sessionRows,
  ] = await Promise.all([
    buildMarketingOverviewResponse(organizationId, startDate, endDate),
    getWebAttributionRangeTotals({ organizationId, startDate, endDate }),
    getWebSourceMetricsInRange({ organizationId, startDate, endDate }),
    countTwilioCallsBySourceInRange({ organizationId, startDate, endDate }),
    countTwilioTrackingCallsInRange({ organizationId, startDate, endDate }),
    getTopLandingPagesInRange({ organizationId, startDate, endDate, limit: 3 }),
    getWebAttributionDailySeries({ organizationId, startDate, endDate }),
    getGbpMetricsDailyInRange(organizationId, startDate, endDate),
    getRecentWebAttributionSessionEvents({
      organizationId,
      maxVisitors: 40,
      startDate,
      endDate,
    }),
  ]);
  const gbpDaily = liveGbpDaily ?? dbGbpDaily;

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
  const gbpTotals = gbpDaily.reduce(
    (acc, row) => {
      acc.viewsMaps += row.views_maps;
      acc.viewsSearch += row.views_search;
      acc.actionsWebsite += row.actions_website;
      acc.actionsPhone += row.actions_phone;
      acc.actionsDirections += row.actions_directions;
      return acc;
    },
    {
      viewsMaps: 0,
      viewsSearch: 0,
      actionsWebsite: 0,
      actionsPhone: 0,
      actionsDirections: 0,
    }
  );

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
      daily: webDaily.map((row) => ({
        date: row.metric_date,
        visitors: row.unique_visitors,
        pageViews: row.page_loads,
        forms: row.form_submits,
        phoneClicks: row.tel_clicks,
        bookings: row.web_bookings,
      })),
    },
    gbpInsights: {
      metrics: {
        queriesDirect: liveQueriesDirect,
        queriesIndirect: liveQueriesIndirect,
        viewsMaps: gbpTotals.viewsMaps,
        viewsSearch: gbpTotals.viewsSearch,
        actionsWebsite: gbpTotals.actionsWebsite,
        actionsPhone: gbpTotals.actionsPhone,
        actionsDirections: gbpTotals.actionsDirections,
      },
      daily: gbpDaily.map((row) => ({
        date: row.metric_date,
        viewsMaps: row.views_maps,
        viewsSearch: row.views_search,
        actionsWebsite: row.actions_website,
        actionsPhone: row.actions_phone,
        actionsDirections: row.actions_directions,
      })),
    },
    recentSessions,
  };
}
