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
): Promise<{ ok: boolean; error?: string; daysWritten?: number }> {
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
      const metric = String(s.dailyMetric ?? s.daily_metric ?? "");
      const tsRaw = s.timeSeries ?? s.time_series;
      const tsObj = tsRaw && typeof tsRaw === "object" ? (tsRaw as Record<string, unknown>) : null;
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

    await setMarketingSyncSuccess({
      organizationId,
      integration: "gbp_performance",
      cursorJson: { locationId, daysWritten, rangeStart, rangeEnd },
    });

    return { ok: true, daysWritten };
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
