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

function attributionEventTypeLabel(eventType: string, pageUrl: string | null): string {
  if (eventType === "page_view" && isLikelyBookingCompletionUrl(pageUrl)) {
    return "Booking complete";
  }
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

export function AttributionInsightsClient() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [preset, setPreset] = useState<DashboardDatePreset>("thisPayPeriod");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [data, setData] = useState<AttributionOverviewApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSessionVisitors, setExpandedSessionVisitors] = useState<Set<string>>(
    () => new Set()
  );

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
      const qs = new URLSearchParams({
        startDate: apiStart,
        endDate: apiEnd,
      });
      const res = await fetch(`/api/attribution/overview?${qs}`);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Failed to load attribution overview");
      }
      const json = (await res.json()) as AttributionOverviewApi;
      setData(json);
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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Reporting period</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{rangeDescription}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{dr.rangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/insights/attribution/setup"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Setup
          </Link>
          <div className="flex flex-wrap rounded border border-zinc-300 dark:border-zinc-600">
            {DASHBOARD_PRESET_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setPreset(r)}
                className={`px-2.5 py-1.5 text-xs sm:text-sm ${
                  preset === r
                    ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {DASHBOARD_PRESET_LABELS[r]}
              </button>
            ))}
          </div>
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
        </div>
      </div>

      <section>
        <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">Key metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip label="Site sessions" tooltip="Unique visitors on your site with the attribution snippet, in this period." />
            </h3>
            {loading ? (
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
            ) : error ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : (
              <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {kpis?.siteSessions ?? "—"}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip
                label="Calls"
                tooltip="On-site phone link taps plus completed calls to Twilio tracking numbers in this period."
              />
            </h3>
            {loading ? (
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
            ) : error ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : (
              <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {kpis?.calls ?? "—"}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Avg CPL</h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-400 dark:text-zinc-500">—</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Planned: Google Ads API for cost-per-lead.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip
                label="Avg booking rate"
                tooltip="Across HCP-attributed channels: booked jobs ÷ attributed jobs in this period."
              />
            </h3>
            {loading ? (
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
            ) : error ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : (
              <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatPct(kpis?.avgBookingRatePercent ?? null)}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip
                label="Avg conversion rate"
                tooltip="Across HCP-attributed channels: paid jobs ÷ attributed jobs in this period."
              />
            </h3>
            {loading ? (
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
            ) : error ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : (
              <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatPct(kpis?.avgConversionRatePercent ?? null)}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip
                label="Avg job value"
                tooltip="Attributed paid revenue ÷ paid jobs across channels in this period."
              />
            </h3>
            {loading ? (
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
            ) : error ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : (
              <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {kpis?.avgJobValue != null ? formatMoney(kpis.avgJobValue) : "—"}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Avg CAC</h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-400 dark:text-zinc-500">—</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Planned: Google Ads API and blended acquisition cost.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Avg ROAS</h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-400 dark:text-zinc-500">—</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Planned: Google Ads API for return on ad spend.
            </p>
          </div>
        </div>
      </section>

      <MarketingLeadSourceTable
        overview={data?.marketingOverview ?? null}
        loading={loading}
        isAdmin={isAdmin}
      />

      <div id="call-tracking" className="scroll-mt-24 space-y-4">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Call tracking &amp; conversions</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          GHL opportunity calls, booking rates by CSR, and waiting window — scoped to the reporting period selected above.
        </p>
        <CallInsightsClient
          startDate={apiStart}
          endDate={apiEnd}
          syncedRangeDescription={rangeDescription}
        />
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Website traffic</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Aggregates from your attribution pixel for {rangeDescription}, including how activity splits across tracking
          sources.
        </p>

        <div className="mt-6 overflow-x-auto">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            By source
          </h3>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Source</th>
                <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Site sessions</th>
                <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Web phone taps</th>
                <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Tracked calls</th>
                <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Forms</th>
                <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Web bookings</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="py-4 text-zinc-500 dark:text-zinc-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading &&
                (data?.webSourceBreakdown ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-zinc-500 dark:text-zinc-400">
                      No web attribution by source in this period. Complete setup and drive tagged traffic.
                    </td>
                  </tr>
                )}
              {!loading &&
                (data?.webSourceBreakdown ?? []).map((row) => (
                  <tr key={row.source_id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 text-zinc-900 dark:text-zinc-50">{row.source_label}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.site_sessions}
                    </td>
                    <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.web_tel_clicks}
                    </td>
                    <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.tracked_calls}
                    </td>
                    <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.form_submits}
                    </td>
                    <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.web_bookings}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <dl className="mt-8 grid gap-4 border-t border-zinc-100 pt-6 dark:border-zinc-800 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Avg. time on site</dt>
            <dd className="mt-1 text-lg font-semibold text-zinc-400 dark:text-zinc-500">—</dd>
            <dd className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Planned: session duration analytics.</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total site visits</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {loading ? "…" : (data?.websiteTraffic.totalSiteVisits ?? "—")}
            </dd>
            <dd className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Distinct visitors with the snippet in this period — same as Site sessions above.
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Top landing pages</dt>
            <dd className="mt-1 space-y-1 text-sm text-zinc-800 dark:text-zinc-200">
              {loading && "…"}
              {!loading &&
                (data?.websiteTraffic.topLandingPages ?? []).length === 0 && (
                  <span className="text-zinc-500 dark:text-zinc-400">No data yet.</span>
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
            </dd>
          </div>
        </dl>

        <div className="mt-8 border-t border-zinc-100 pt-6 dark:border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Session log</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Recent visitors in this period. Expand to see pages, phone taps, forms, and bookings.
          </p>
          <div className="mt-3 space-y-2">
            {loading && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
            )}
            {!loading && (data?.recentSessions ?? []).length === 0 && (
              <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-4 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
                No sessions in this range.
              </p>
            )}
            {!loading &&
              (data?.recentSessions ?? []).map((sess) => {
                const open = expandedSessionVisitors.has(sess.visitor_id);
                const started = new Date(sess.started_at);
                const lastAt = new Date(sess.last_activity_at);
                const sameMoment = started.getTime() === lastAt.getTime();
                return (
                  <div
                    key={sess.visitor_id}
                    className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedSessionVisitors((prev) => {
                          const next = new Set(prev);
                          if (next.has(sess.visitor_id)) next.delete(sess.visitor_id);
                          else next.add(sess.visitor_id);
                          return next;
                        });
                      }}
                      aria-expanded={open}
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                    >
                      <span className="mt-0.5 shrink-0 text-zinc-400" aria-hidden>
                        <svg
                          className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M6.293 4.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L9.586 10 6.293 6.707a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-medium text-zinc-900 dark:text-zinc-50">
                            {started.toLocaleString()}
                          </span>
                          {!sameMoment && (
                            <span className="text-zinc-500 dark:text-zinc-400">
                              Last activity {lastAt.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-700 dark:text-zinc-300">
                          <span>
                            <span className="text-zinc-500 dark:text-zinc-400">Source </span>
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {sess.entry_source_label ?? "—"}
                            </span>
                          </span>
                          <span className="hidden sm:inline text-zinc-300 dark:text-zinc-600">·</span>
                          <span className="min-w-0 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                            Started on {formatSessionPath(sess.entry_page_url)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {sess.has_call ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200">
                              Call
                            </span>
                          ) : null}
                          {sess.has_form ? (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-900 dark:bg-violet-950/80 dark:text-violet-200">
                              Form
                            </span>
                          ) : null}
                          {sess.has_booking ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-950 dark:bg-amber-950/60 dark:text-amber-100">
                              Booking
                            </span>
                          ) : null}
                          {!sess.has_call && !sess.has_form && !sess.has_booking ? (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                              No call / form / booking in session
                            </span>
                          ) : null}
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            {sess.event_count} step{sess.event_count === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </button>
                    {open ? (
                      <div className="border-t border-zinc-100 bg-zinc-50/80 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          Session log
                        </p>
                        <ol className="space-y-3 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
                          {sess.events.map((ev) => (
                            <li key={ev.id} className="relative">
                              <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                {new Date(ev.occurred_at).toLocaleString()}
                              </div>
                              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                {attributionEventTypeLabel(ev.event_type, ev.page_url)}
                              </div>
                              {ev.source_label ? (
                                <div className="text-xs text-zinc-600 dark:text-zinc-400">Source: {ev.source_label}</div>
                              ) : null}
                              {ev.page_url ? (
                                <div className="mt-0.5 break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                                  {ev.page_url}
                                </div>
                              ) : null}
                              {ev.referrer ? (
                                <div className="mt-0.5 break-all text-[11px] text-zinc-500 dark:text-zinc-500">
                                  Referrer: {ev.referrer}
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>
      </section>
    </div>
  );
}
