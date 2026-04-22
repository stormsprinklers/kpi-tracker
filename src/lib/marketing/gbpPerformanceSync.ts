import { getGoogleBusinessProfile } from "@/lib/db/queries";
import { getGoogleBusinessAccessTokenForOrg } from "@/lib/googleBusinessTokens";
import {
  upsertGbpMetricsDaily,
  setMarketingSyncSuccess,
  setMarketingSyncError,
} from "@/lib/db/marketingQueries";

/** Daily metric types for Business Profile Performance API (v1). */
const DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
] as const;

function parseDateRange(
  start: string,
  end: string
): { startDate: { year: number; month: number; day: number }; endDate: { year: number; month: number; day: number } } {
  const [ys, ms, ds] = start.slice(0, 10).split("-").map(Number);
  const [ye, me, de] = end.slice(0, 10).split("-").map(Number);
  return {
    startDate: { year: ys, month: ms, day: ds },
    endDate: { year: ye, month: me, day: de },
  };
}

/**
 * Pull multi-day time series from Business Profile Performance API and upsert `fact_gbp_metrics_daily`.
 * Uses the same OAuth token as Google Business Profile (business.manage scope).
 */
export async function syncGbpPerformanceMetricsForOrganization(
  organizationId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<{
  ok: boolean;
  error?: string;
  daysWritten?: number;
  totals?: {
    viewsMaps: number;
    viewsSearch: number;
    actionsWebsite: number;
    actionsPhone: number;
    actionsDirections: number;
  };
  queriesDirect?: number | null;
  queriesIndirect?: number | null;
  daily?: Array<{
    metric_date: string;
    views_maps: number;
    views_search: number;
    actions_website: number;
    actions_phone: number;
    actions_directions: number;
  }>;
}> {
  const profile = await getGoogleBusinessProfile(organizationId);
  const locationId = profile?.location_id?.trim();
  if (!locationId || !profile?.google_account_connected) {
    await setMarketingSyncError({
      organizationId,
      integration: "gbp_performance",
      message: "Google Business Profile location not connected",
    });
    return { ok: false, error: "Google Business Profile not connected" };
  }

  try {
    const accessToken = await getGoogleBusinessAccessTokenForOrg(organizationId);
    const name = `locations/${locationId}`;

    const body = {
      dailyMetrics: [...DAILY_METRICS],
      dailyRange: parseDateRange(rangeStart, rangeEnd),
    };

    const url = `https://businessprofileperformance.googleapis.com/v1/${name}:fetchMultiDailyMetricsTimeSeries`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const accountId = profile.account_id?.trim() ?? "";
      if (accountId) {
        const legacy = await fetchLegacyInsightsTotals({
          accessToken,
          accountId,
          locationId,
          rangeStart,
          rangeEnd,
        });
        if (legacy.anyValue) {
          await setMarketingSyncSuccess({
            organizationId,
            integration: "gbp_performance",
            cursorJson: {
              locationId,
              fallback: "reportInsights",
              rangeStart,
              rangeEnd,
            },
          });
          return {
            ok: true,
            daysWritten: 0,
            daily: [],
            queriesDirect: legacy.queriesDirect,
            queriesIndirect: legacy.queriesIndirect,
            totals: {
              viewsMaps: legacy.viewsMaps ?? 0,
              viewsSearch: legacy.viewsSearch ?? 0,
              actionsWebsite: legacy.actionsWebsite ?? 0,
              actionsPhone: legacy.actionsPhone ?? 0,
              actionsDirections: legacy.actionsDirections ?? 0,
            },
          };
        }
      }
      const msg =
        (json.error as { message?: string } | undefined)?.message ??
        (json.message as string | undefined) ??
        `GBP Performance API ${res.status}`;
      await setMarketingSyncError({
        organizationId,
        integration: "gbp_performance",
        message: msg,
      });
      return { ok: false, error: msg };
    }

    const multi = (json.multiDailyMetricTimeSeries ??
      json.multi_daily_metric_time_series) as unknown[] | undefined;
    const seriesList = Array.isArray(multi) ? multi : [];

    type DayAgg = {
      desktopMaps: number;
      desktopSearch: number;
      mobileMaps: number;
      mobileSearch: number;
      calls: number;
      web: number;
      directions: number;
    };
    const byDate = new Map<string, DayAgg>();

    const bump = (date: string, key: keyof DayAgg, v: number) => {
      let row = byDate.get(date);
      if (!row) {
        row = { desktopMaps: 0, desktopSearch: 0, mobileMaps: 0, mobileSearch: 0, calls: 0, web: 0, directions: 0 };
        byDate.set(date, row);
      }
      row[key] += v;
    };

    for (const series of seriesList) {
      const s = series as Record<string, unknown>;
      const seriesNodeRaw =
        s.dailyMetricTimeSeries ??
        s.daily_metric_time_series ??
        s.timeSeries ??
        s.time_series ??
        null;
      const seriesNode =
        seriesNodeRaw && typeof seriesNodeRaw === "object"
          ? (seriesNodeRaw as Record<string, unknown>)
          : null;
      const metric = String(
        s.dailyMetric ??
          s.daily_metric ??
          seriesNode?.dailyMetric ??
          seriesNode?.daily_metric ??
          ""
      );
      const tsRaw = seriesNode?.timeSeries ?? seriesNode?.time_series ?? seriesNode;
      const tsObj =
        tsRaw && typeof tsRaw === "object" ? (tsRaw as Record<string, unknown>) : null;
      const ts = (tsObj?.datedValues ?? tsObj?.dated_values) as unknown[] | undefined;
      if (!Array.isArray(ts)) continue;

      for (const pt of ts) {
        const p = pt as Record<string, unknown>;
        const dateObj = (p.date ?? p) as Record<string, unknown>;
        const y = Number(dateObj.year);
        const m = Number(dateObj.month);
        const d = Number(dateObj.day);
        if (!y || !m || !d) continue;
        const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const val = Number(p.value ?? 0);
        if (Number.isNaN(val)) continue;

        switch (metric) {
          case "BUSINESS_IMPRESSIONS_DESKTOP_MAPS":
            bump(dateStr, "desktopMaps", val);
            break;
          case "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH":
            bump(dateStr, "desktopSearch", val);
            break;
          case "BUSINESS_IMPRESSIONS_MOBILE_MAPS":
            bump(dateStr, "mobileMaps", val);
            break;
          case "BUSINESS_IMPRESSIONS_MOBILE_SEARCH":
            bump(dateStr, "mobileSearch", val);
            break;
          case "CALL_CLICKS":
            bump(dateStr, "calls", val);
            break;
          case "WEBSITE_CLICKS":
            bump(dateStr, "web", val);
            break;
          case "BUSINESS_DIRECTION_REQUESTS":
            bump(dateStr, "directions", val);
            break;
          default:
            break;
        }
      }
    }

    let daysWritten = 0;
    for (const [metricDate, vals] of byDate) {
      await upsertGbpMetricsDaily({
        organizationId,
        metricDate,
        locationId,
        callClicks: vals.calls,
        websiteClicks: vals.web,
        directionRequests: vals.directions,
        impressionsDesktopMaps: vals.desktopMaps,
        impressionsDesktopSearch: vals.desktopSearch,
        impressionsMobileMaps: vals.mobileMaps,
        impressionsMobileSearch: vals.mobileSearch,
      });
      daysWritten++;
    }

    const daily = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([metric_date, vals]) => ({
        metric_date,
        views_maps: vals.desktopMaps + vals.mobileMaps,
        views_search: vals.desktopSearch + vals.mobileSearch,
        actions_website: vals.web,
        actions_phone: vals.calls,
        actions_directions: vals.directions,
      }));

    let queriesDirect: number | null = null;
    let queriesIndirect: number | null = null;
    let fallbackTotals:
      | {
          viewsMaps: number;
          viewsSearch: number;
          actionsWebsite: number;
          actionsPhone: number;
          actionsDirections: number;
        }
      | undefined;
    const accountId = profile.account_id?.trim() ?? "";
    if (accountId) {
      const legacy = await fetchLegacyInsightsTotals({
        accessToken,
        accountId,
        locationId,
        rangeStart,
        rangeEnd,
      });
      queriesDirect = legacy.queriesDirect;
      queriesIndirect = legacy.queriesIndirect;
      if (legacy.anyValue) {
        fallbackTotals = {
          viewsMaps: legacy.viewsMaps ?? 0,
          viewsSearch: legacy.viewsSearch ?? 0,
          actionsWebsite: legacy.actionsWebsite ?? 0,
          actionsPhone: legacy.actionsPhone ?? 0,
          actionsDirections: legacy.actionsDirections ?? 0,
        };
      }
    }

    await setMarketingSyncSuccess({
      organizationId,
      integration: "gbp_performance",
      cursorJson: { locationId, daysWritten, rangeStart, rangeEnd },
    });

    return {
      ok: true,
      daysWritten,
      daily,
      queriesDirect,
      queriesIndirect,
      totals: fallbackTotals,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setMarketingSyncError({
      organizationId,
      integration: "gbp_performance",
      message: msg,
    });
    return { ok: false, error: msg };
  }
}

async function fetchLegacyInsightsTotals(params: {
  accessToken: string;
  accountId: string;
  locationId: string;
  rangeStart: string;
  rangeEnd: string;
}): Promise<{
  queriesDirect: number | null;
  queriesIndirect: number | null;
  viewsMaps: number | null;
  viewsSearch: number | null;
  actionsWebsite: number | null;
  actionsPhone: number | null;
  actionsDirections: number | null;
  anyValue: boolean;
}> {
  const url = `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(
    params.accountId
  )}/locations:reportInsights`;
  const body = {
    locationNames: [`accounts/${params.accountId}/locations/${params.locationId}`],
    basicRequest: {
      metricRequests: [
        { metric: "QUERIES_DIRECT", options: "AGGREGATED_TOTAL" },
        { metric: "QUERIES_INDIRECT", options: "AGGREGATED_TOTAL" },
        { metric: "VIEWS_MAPS", options: "AGGREGATED_TOTAL" },
        { metric: "VIEWS_SEARCH", options: "AGGREGATED_TOTAL" },
        { metric: "ACTIONS_WEBSITE", options: "AGGREGATED_TOTAL" },
        { metric: "ACTIONS_PHONE", options: "AGGREGATED_TOTAL" },
        { metric: "ACTIONS_DRIVING_DIRECTIONS", options: "AGGREGATED_TOTAL" },
      ],
      timeRange: {
        startTime: `${params.rangeStart.slice(0, 10)}T00:00:00Z`,
        endTime: `${params.rangeEnd.slice(0, 10)}T23:59:59Z`,
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      queriesDirect: null,
      queriesIndirect: null,
      viewsMaps: null,
      viewsSearch: null,
      actionsWebsite: null,
      actionsPhone: null,
      actionsDirections: null,
      anyValue: false,
    };
  }

  const metrics = ((json.locationMetrics as unknown[] | undefined) ?? [])[0] as
    | { metricValues?: unknown[] }
    | undefined;
  const metricValues = Array.isArray(metrics?.metricValues) ? metrics.metricValues : [];

  let queriesDirect: number | null = null;
  let queriesIndirect: number | null = null;
  let viewsMaps: number | null = null;
  let viewsSearch: number | null = null;
  let actionsWebsite: number | null = null;
  let actionsPhone: number | null = null;
  let actionsDirections: number | null = null;
  for (const mv of metricValues) {
    const row = mv as {
      metric?: string;
      totalValue?: Record<string, unknown>;
      dimensionalValues?: Array<{ value?: Record<string, unknown> }>;
    };
    const metric = (row.metric ?? "").toString();
    const parsed = parseMetricNumber(row);
    if (metric === "QUERIES_DIRECT") queriesDirect = parsed;
    if (metric === "QUERIES_INDIRECT") queriesIndirect = parsed;
    if (metric === "VIEWS_MAPS") viewsMaps = parsed;
    if (metric === "VIEWS_SEARCH") viewsSearch = parsed;
    if (metric === "ACTIONS_WEBSITE") actionsWebsite = parsed;
    if (metric === "ACTIONS_PHONE") actionsPhone = parsed;
    if (metric === "ACTIONS_DRIVING_DIRECTIONS") actionsDirections = parsed;
  }
  return {
    queriesDirect,
    queriesIndirect,
    viewsMaps,
    viewsSearch,
    actionsWebsite,
    actionsPhone,
    actionsDirections,
    anyValue:
      queriesDirect != null ||
      queriesIndirect != null ||
      viewsMaps != null ||
      viewsSearch != null ||
      actionsWebsite != null ||
      actionsPhone != null ||
      actionsDirections != null,
  };
}

function parseMetricNumber(row: {
  totalValue?: Record<string, unknown>;
  dimensionalValues?: Array<{ value?: Record<string, unknown> }>;
}): number | null {
  const total = row.totalValue ?? {};
  const candidates: unknown[] = [
    total.value,
    total.int64Value,
    total.doubleValue,
    row.dimensionalValues?.[0]?.value?.value,
    row.dimensionalValues?.[0]?.value?.int64Value,
    row.dimensionalValues?.[0]?.value?.doubleValue,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
