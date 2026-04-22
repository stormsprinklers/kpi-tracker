"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { MarketingOverviewResponse } from "@/lib/marketing/types";
import {
  DASHBOARD_PRESET_LABELS,
  DASHBOARD_PRESET_ORDER,
  type DashboardDatePreset,
  getDashboardDateRange,
} from "@/lib/dashboardDateRange";
import { usePayPeriodCalendar } from "@/hooks/usePayPeriodCalendar";
import { isLikelyBookingCompletionUrl } from "@/lib/webAttribution/bookingCompletionHeuristics";
import { CallInsightsClient } from "./CallInsightsClient";
import { MarketingLeadSourceTable } from "./MarketingLeadSourceTable";
import { MetricTooltip } from "./MetricTooltip";

type AttributionSessionEvent = {
  id: string;
  event_type: string;
  occurred_at: string;
  page_url: string | null;
  source_label: string | null;
  referrer: string | null;
  metadata: Record<string, unknown>;
};

type AttributionSession = {
  visitor_id: string;
  started_at: string;
  last_activity_at: string;
  entry_source_label: string | null;
  entry_page_url: string | null;
  has_call: boolean;
  has_form: boolean;
  has_booking: boolean;
  event_count: number;
  events: AttributionSessionEvent[];
};

type AttributionOverviewApi = {
  startDate: string;
  endDate: string;
  kpis: {
    siteSessions: number;
    calls: number;
    avgCpl: null;
    avgBookingRatePercent: number | null;
    avgConversionRatePercent: number | null;
    avgJobValue: number | null;
    avgCac: null;
    avgRoas: null;
  };
  marketingOverview: MarketingOverviewResponse;
  webSourceBreakdown: Array<{
    source_id: string;
    source_label: string;
    site_sessions: number;
    web_tel_clicks: number;
    tracked_calls: number;
    form_submits: number;
    web_bookings: number;
  }>;
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
  recentSessions: AttributionSession[];
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function formatInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US").format(v);
}

function formatSessionPath(url: string | null): string {
  if (!url?.trim()) return "—";
  try {
    const u = new URL(url);
    const q = u.search || "";
    const path = (u.pathname || "/") + q;
    return path.length > 72 ? `${path.slice(0, 70)}…` : path;
  } catch {
    return url.length > 72 ? `${url.slice(0, 70)}…` : url;
  }
}

function enumerateYmdRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startYmd}T00:00:00Z`);
  const end = new Date(`${endYmd}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out;
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function attributionEventTypeLabel(eventType: string, pageUrl: string | null): string {
  if (eventType === "page_view" && isLikelyBookingCompletionUrl(pageUrl)) return "Booking complete";
  switch (eventType) {
    case "landing":
      return "Landing";
    case "page_view":
      return "Page view";
    case "tel_click":
      return "Phone link tap";
    case "form_submit":
      return "Form submit";
    case "booking":
      return "Booking";
    case "verify_ping":
      return "Verify ping";
    default:
      return eventType;
  }
}

function TrendChart({ values, labels }: { values: number[]; labels: string[] }) {
  const width = 680;
  const height = 190;
  const padX = 18;
  const padY = 12;
  const padBottom = 26;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const xSpan = Math.max(width - padX * 2, 1);
  const ySpan = Math.max(height - padY - padBottom, 1);

  const pts = values.map((v, i) => {
    const x = padX + (i / Math.max(values.length - 1, 1)) * xSpan;
    const y = padY + ySpan - ((v - min) / range) * ySpan;
    return { x, y };
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area =
    pts.length > 0
      ? `${line} L${pts[pts.length - 1]!.x.toFixed(2)},${(height - padY).toFixed(2)} L${pts[0]!.x.toFixed(
          2
        )},${(height - padY).toFixed(2)} Z`
      : "";

  if (values.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No chart data in this period.</p>;
  }

  const tickStep = Math.max(1, Math.ceil(labels.length / 6));
  const ticks = labels
    .map((label, idx) => ({ label, idx }))
    .filter((x) => x.idx % tickStep === 0 || x.idx === labels.length - 1);
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
        <path d={area} className="text-sky-200/70 dark:text-sky-900/40" fill="currentColor" />
        <path d={line} className="text-sky-600 dark:text-sky-400" stroke="currentColor" strokeWidth={2.5} fill="none" />
        {ticks.map((t) => {
          const x = padX + (t.idx / Math.max(labels.length - 1, 1)) * xSpan;
          return (
            <text
              key={`${t.label}-${t.idx}`}
              x={x}
              y={height - 6}
              textAnchor="middle"
              className="fill-zinc-500 text-[10px] dark:fill-zinc-400"
            >
              {t.label.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function AdsChannelCard({
  label,
  spend,
  cpl,
  roas,
  sourceText,
}: {
  label: string;
  spend: number | null | undefined;
  cpl: number | null | undefined;
  roas: number | null | undefined;
  sourceText: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{label}</h3>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <MetricTooltip
            label="Spend"
            tooltip={`Definition: platform-reported ad spend in selected range. Source/config: ${sourceText}.`}
          />
          <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
            {spend != null ? formatMoney(spend) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <MetricTooltip
            label="CPL"
            tooltip={`Definition: spend divided by qualified leads. Source/config: ${sourceText}; pending where integrations are incomplete.`}
          />
          <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
            {cpl != null ? formatMoney(cpl) : "Coming soon"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <MetricTooltip
            label="ROAS"
            tooltip={`Definition: attributed revenue divided by spend. Source/config: requires spend sync + attribution mapping in Attribution setup.`}
          />
          <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
            {roas != null ? `${roas.toFixed(2)}x` : "Coming soon"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function AttributionInsightsClient() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [preset, setPreset] = useState<DashboardDatePreset>("thisPayPeriod");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [data, setData] = useState<AttributionOverviewApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionLogOpen, setSessionLogOpen] = useState(false);
  const [expandedSessionVisitors, setExpandedSessionVisitors] = useState<Set<string>>(() => new Set());

  const payPeriodCalendar = usePayPeriodCalendar();
  const dr = useMemo(
    () => getDashboardDateRange(preset, customStart, customEnd, payPeriodCalendar),
    [preset, customStart, customEnd, payPeriodCalendar]
  );
  const todayStr = new Date().toISOString().slice(0, 10);
  const apiStart = dr.isAllTime ? "2000-01-01" : dr.startDate ?? todayStr;
  const apiEnd = dr.isAllTime ? todayStr : dr.endDate ?? todayStr;
  const rangeDescription = `${apiStart} → ${apiEnd}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ startDate: apiStart, endDate: apiEnd });
      const res = await fetch(`/api/attribution/overview?${qs}`);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Failed to load attribution overview");
      }
      setData((await res.json()) as AttributionOverviewApi);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [apiStart, apiEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = data?.kpis;
  const websiteByDay = data?.websiteTraffic.daily ?? [];
  const websiteForms = data?.webSourceBreakdown.reduce((s, row) => s + row.form_submits, 0) ?? 0;
  const websiteBookings = data?.webSourceBreakdown.reduce((s, row) => s + row.web_bookings, 0) ?? 0;

  const gbpByDay = data?.gbpInsights.daily ?? [];
  const shouldFillDailySeries = useMemo(() => {
    const s = new Date(`${apiStart}T00:00:00Z`);
    const e = new Date(`${apiEnd}T00:00:00Z`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
    const days = Math.floor((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    return days > 0 && days <= 120;
  }, [apiStart, apiEnd]);
  const fullRangeDates = useMemo(
    () => (shouldFillDailySeries ? enumerateYmdRange(apiStart, apiEnd) : []),
    [shouldFillDailySeries, apiStart, apiEnd]
  );
  const websiteChartSeries = useMemo(() => {
    if (!shouldFillDailySeries) return websiteByDay;
    const byDate = new Map(websiteByDay.map((d) => [d.date, d]));
    return fullRangeDates.map((date) => ({
      date,
      visitors: byDate.get(date)?.visitors ?? 0,
      pageViews: byDate.get(date)?.pageViews ?? 0,
      forms: byDate.get(date)?.forms ?? 0,
      phoneClicks: byDate.get(date)?.phoneClicks ?? 0,
      bookings: byDate.get(date)?.bookings ?? 0,
    }));
  }, [websiteByDay, shouldFillDailySeries, fullRangeDates]);
  const gbpChartSeries = useMemo(() => {
    if (!shouldFillDailySeries) return gbpByDay;
    const byDate = new Map(gbpByDay.map((d) => [d.date, d]));
    return fullRangeDates.map((date) => ({
      date,
      viewsMaps: byDate.get(date)?.viewsMaps ?? 0,
      viewsSearch: byDate.get(date)?.viewsSearch ?? 0,
      actionsWebsite: byDate.get(date)?.actionsWebsite ?? 0,
      actionsPhone: byDate.get(date)?.actionsPhone ?? 0,
      actionsDirections: byDate.get(date)?.actionsDirections ?? 0,
    }));
  }, [gbpByDay, shouldFillDailySeries, fullRangeDates]);
  const websiteVisitorsPoints = websiteChartSeries.map((d) => d.visitors);
  const websiteLabels = websiteChartSeries.map((d) => d.date);
  const gbpPoints = gbpChartSeries.map((d) => d.viewsMaps + d.viewsSearch);
  const gbpLabels = gbpChartSeries.map((d) => d.date);

  const channelBySlug = useMemo(() => {
    const map = new Map<string, MarketingOverviewResponse["channels"][number]>();
    for (const c of data?.marketingOverview.channels ?? []) map.set(c.slug, c);
    return map;
  }, [data?.marketingOverview.channels]);
  const gbpMetrics = data?.gbpInsights.metrics;
  const gbpViewsMaps = gbpMetrics?.viewsMaps ?? 0;
  const gbpViewsSearch = gbpMetrics?.viewsSearch ?? 0;
  const gbpActionsWebsite = gbpMetrics?.actionsWebsite ?? 0;
  const gbpActionsPhone = gbpMetrics?.actionsPhone ?? 0;
  const gbpHasData =
    gbpViewsMaps + gbpViewsSearch + gbpActionsWebsite + gbpActionsPhone > 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Attribution insights</h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{rangeDescription}</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{dr.rangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DashboardDatePreset)}
              className="rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {DASHBOARD_PRESET_ORDER.map((r) => (
                <option key={r} value={r}>
                  {DASHBOARD_PRESET_LABELS[r]}
                </option>
              ))}
            </select>
            {preset === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <span className="text-zinc-500">–</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>
            )}
            <button
              type="button"
              onClick={load}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Refresh
            </button>
            <Link
              href="/insights/attribution/setup"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Setup
            </Link>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Website</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Traffic and on-site conversion flow.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="Site sessions"
              tooltip="Definition: distinct visitors with attribution events. Source/config: requires attribution snippet installed in Attribution setup."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{loading ? "…" : formatInt(kpis?.siteSessions)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="Calls"
              tooltip="Definition: website phone taps plus tracked Twilio calls. Source/config: configure tracking numbers and call forwarding in Attribution setup."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{loading ? "…" : formatInt(kpis?.calls)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="Form submits"
              tooltip="Definition: form completion events captured by the attribution script. Source/config: configure submit event tracking on your web forms."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{loading ? "…" : formatInt(websiteForms)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="Web bookings"
              tooltip="Definition: booking events and booking-success URL hits. Source/config: confirm success-page detection in Attribution setup."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{loading ? "…" : formatInt(websiteBookings)}</p>
          </div>
        </div>

        <div className="mt-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Traffic over time (visitors)</h4>
          <TrendChart values={websiteVisitorsPoints} labels={websiteLabels} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">By source</h4>
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Source</th>
                  <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Sessions</th>
                  <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Phone taps</th>
                  <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Forms</th>
                  <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Bookings</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="py-3 text-zinc-500 dark:text-zinc-400">Loading…</td>
                  </tr>
                )}
                {!loading && (data?.webSourceBreakdown ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-zinc-500 dark:text-zinc-400">No web attribution source data in this period.</td>
                  </tr>
                )}
                {!loading &&
                  (data?.webSourceBreakdown ?? []).map((row) => (
                    <tr key={row.source_id} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="py-2 text-zinc-900 dark:text-zinc-100">{row.source_label}</td>
                      <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.site_sessions}</td>
                      <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.web_tel_clicks}</td>
                      <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.form_submits}</td>
                      <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.web_bookings}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Top landing pages</h4>
            <div className="space-y-1 text-sm">
              {loading && <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>}
              {!loading && (data?.websiteTraffic.topLandingPages ?? []).length === 0 && (
                <p className="text-zinc-500 dark:text-zinc-400">No landing page data in this period.</p>
              )}
              {!loading &&
                (data?.websiteTraffic.topLandingPages ?? []).map((p, i) => (
                  <div key={p.page_url} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-xs" title={p.page_url}>
                      {i + 1}. {formatSessionPath(p.page_url)}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">{p.views}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setSessionLogOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left"
            aria-expanded={sessionLogOpen}
          >
            <span>
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Session log</span>
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">Advanced detail</span>
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{sessionLogOpen ? "Hide" : "Show"}</span>
          </button>
          {sessionLogOpen ? (
            <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
              {loading && <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}
              {!loading && (data?.recentSessions ?? []).length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No sessions in this range.</p>
              )}
              {!loading &&
                (data?.recentSessions ?? []).map((sess) => {
                  const open = expandedSessionVisitors.has(sess.visitor_id);
                  const started = new Date(sess.started_at);
                  const lastAt = new Date(sess.last_activity_at);
                  return (
                    <div key={sess.visitor_id} className="mb-2 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSessionVisitors((prev) => {
                            const next = new Set(prev);
                            if (next.has(sess.visitor_id)) next.delete(sess.visitor_id);
                            else next.add(sess.visitor_id);
                            return next;
                          })
                        }
                        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                        aria-expanded={open}
                      >
                        <div className="space-y-1 text-xs">
                          <p className="font-medium text-zinc-900 dark:text-zinc-50">{started.toLocaleString()}</p>
                          <p className="text-zinc-600 dark:text-zinc-400">Last activity {lastAt.toLocaleString()}</p>
                          <p className="text-zinc-600 dark:text-zinc-400">
                            Source {sess.entry_source_label ?? "—"} · {sess.event_count} step{sess.event_count === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{open ? "Hide" : "Show"}</span>
                      </button>
                      {open ? (
                        <div className="border-t border-zinc-100 bg-zinc-50/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                          <ol className="space-y-2">
                            {sess.events.map((ev) => (
                              <li key={ev.id}>
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  {new Date(ev.occurred_at).toLocaleString()}
                                </div>
                                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                  {attributionEventTypeLabel(ev.event_type, ev.page_url)}
                                </div>
                                {ev.page_url ? <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400">{ev.page_url}</div> : null}
                                {ev.referrer ? <div className="text-[11px] text-zinc-500 dark:text-zinc-500">Referrer: {ev.referrer}</div> : null}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Ads</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Meta, Google PPC, and Google LSA performance cards.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <AdsChannelCard
            label="Meta"
            spend={channelBySlug.get("meta_ads")?.spend}
            cpl={channelBySlug.get("meta_ads")?.costPerLead}
            roas={channelBySlug.get("meta_ads")?.roas}
            sourceText="connect Meta Ads integration (coming soon)"
          />
          <AdsChannelCard
            label="Google PPC"
            spend={channelBySlug.get("google_ads")?.spend}
            cpl={channelBySlug.get("google_ads")?.costPerLead}
            roas={channelBySlug.get("google_ads")?.roas}
            sourceText="connect Google Ads integration (coming soon)"
          />
          <AdsChannelCard
            label="Google LSA"
            spend={channelBySlug.get("google_lsa")?.spend}
            cpl={channelBySlug.get("google_lsa")?.costPerLead}
            roas={channelBySlug.get("google_lsa")?.roas}
            sourceText="connect LSA sync or upload spend in Attribution setup"
          />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Sales</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Lead source conversion and revenue performance.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="Avg booking rate"
              tooltip="Definition: booked jobs divided by attributed jobs. Source/config: Housecall Pro jobs + attribution rules in setup."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{loading ? "…" : formatPct(kpis?.avgBookingRatePercent ?? null)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="Avg conversion rate"
              tooltip="Definition: paid jobs divided by attributed jobs. Source/config: requires synced HCP paid amount data."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{loading ? "…" : formatPct(kpis?.avgConversionRatePercent ?? null)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="Avg job value"
              tooltip="Definition: attributed paid revenue divided by paid jobs. Source/config: Housecall Pro revenue + attribution mapping."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {loading ? "…" : kpis?.avgJobValue != null ? formatMoney(kpis.avgJobValue) : "—"}
            </p>
          </div>
        </div>
        <MarketingLeadSourceTable overview={data?.marketingOverview ?? null} loading={loading} isAdmin={isAdmin} />
        <div id="call-tracking" className="scroll-mt-24">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Call tracking &amp; conversions</h4>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            GHL opportunity calls, booking rates by CSR, and waiting window for this reporting period.
          </p>
          <div className="mt-3">
            <CallInsightsClient startDate={apiStart} endDate={apiEnd} syncedRangeDescription={rangeDescription} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Google Business Profile</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Visibility and action metrics from GBP performance sync.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="QUERIES_DIRECT"
              tooltip="Definition: searches for your business by name/address. Source/config: GBP Performance API query metrics; ingestion pending."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {data?.gbpInsights.metrics.queriesDirect == null ? "Coming soon" : formatInt(data.gbpInsights.metrics.queriesDirect)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="QUERIES_INDIRECT"
              tooltip="Definition: category/service searches that surfaced your profile. Source/config: GBP Performance API query metrics; ingestion pending."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {data?.gbpInsights.metrics.queriesIndirect == null ? "Coming soon" : formatInt(data.gbpInsights.metrics.queriesIndirect)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="VIEWS_MAPS"
              tooltip="Definition: profile views from Google Maps. Source/config: connect GBP + performance sync in Attribution setup."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{loading ? "…" : formatInt(gbpViewsMaps)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="VIEWS_SEARCH"
              tooltip="Definition: profile views from Google Search results. Source/config: connect GBP + performance sync."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{loading ? "…" : formatInt(gbpViewsSearch)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="ACTIONS_WEBSITE"
              tooltip="Definition: website clicks from your GBP listing. Source/config: GBP performance sync."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{loading ? "…" : formatInt(gbpActionsWebsite)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <MetricTooltip
              label="ACTIONS_PHONE"
              tooltip="Definition: phone call clicks from GBP. Source/config: GBP performance sync."
            />
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{loading ? "…" : formatInt(gbpActionsPhone)}</p>
          </div>
        </div>
        {!loading && !gbpHasData ? (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            No GBP performance metrics were found for this date range yet. Try a wider range or run GBP Performance sync in Attribution setup.
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">GBP trend (views)</h4>
            <TrendChart values={gbpPoints} labels={gbpLabels} />
          </div>
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Map pack ranking</h4>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Coming soon: geo-grid and local rank visibility module.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
