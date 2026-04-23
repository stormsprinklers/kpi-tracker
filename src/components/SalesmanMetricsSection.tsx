"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardDateRange } from "@/lib/dashboardDateRange";
import { MetricTooltip } from "./MetricTooltip";

interface SalesmanMetrics {
  totalSales: number;
  conversionRate: number | null;
  averageTicket: number | null;
  estimatesGiven: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function metricsUrl(dateRange: DashboardDateRange): string {
  if (dateRange.isAllTime) return "/api/metrics/salesman-metrics";
  const params = new URLSearchParams();
  params.set("startDate", dateRange.startDate!);
  params.set("endDate", dateRange.endDate!);
  return `/api/metrics/salesman-metrics?${params}`;
}

type MetricDeltaTone = "positive" | "negative" | "neutral";

function toUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function ymdFromUtcDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function previousDateRange(dateRange: DashboardDateRange): DashboardDateRange | null {
  if (dateRange.isAllTime || !dateRange.startDate || !dateRange.endDate) return null;
  const start = toUtcDate(dateRange.startDate);
  const end = toUtcDate(dateRange.endDate);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor((end.getTime() - start.getTime()) / dayMs) + 1;
  if (days <= 0) return null;
  const prevEnd = new Date(start.getTime() - dayMs);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * dayMs);
  return {
    isAllTime: false,
    startDate: ymdFromUtcDate(prevStart),
    endDate: ymdFromUtcDate(prevEnd),
    rangeLabel: `${ymdFromUtcDate(prevStart)} → ${ymdFromUtcDate(prevEnd)}`,
  };
}

function percentChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatDelta(delta: number | null): { text: string; tone: MetricDeltaTone } | null {
  if (delta == null || Number.isNaN(delta)) return null;
  if (delta > 0) return { text: `▲ ${delta.toFixed(2)}%`, tone: "positive" };
  if (delta < 0) return { text: `▼ ${Math.abs(delta).toFixed(2)}%`, tone: "negative" };
  return { text: "0.00%", tone: "neutral" };
}

function deltaToneClass(tone: MetricDeltaTone): string {
  if (tone === "positive") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "negative") return "text-red-600 dark:text-red-400";
  return "text-zinc-500 dark:text-zinc-400";
}

export function SalesmanMetricsSection({ dateRange }: { dateRange: DashboardDateRange }) {
  const [metrics, setMetrics] = useState<SalesmanMetrics | null>(null);
  const [previousMetrics, setPreviousMetrics] = useState<SalesmanMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prev = previousDateRange(dateRange);
      const [res, prevRes] = await Promise.all([
        fetch(metricsUrl(dateRange)),
        prev ? fetch(metricsUrl(prev)) : Promise.resolve(null),
      ]);
      if (!res.ok) throw new Error("Failed to load salesman metrics");
      const data = (await res.json()) as SalesmanMetrics;
      setMetrics(data);
      if (prevRes && prevRes.ok) {
        setPreviousMetrics((await prevRes.json()) as SalesmanMetrics);
      } else {
        setPreviousMetrics(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Sales Metrics</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Total Sales" tooltip="Total approved estimate value assigned to you in the selected period." />
          </h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {metrics ? formatCurrency(metrics.totalSales) : "—"}
              </p>
              {(() => {
                const d = formatDelta(percentChange(metrics?.totalSales, previousMetrics?.totalSales));
                return d ? <p className={`mt-0.5 text-[11px] ${deltaToneClass(d.tone)}`}>{d.text}</p> : null;
              })()}
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Conversion Rate" tooltip="Approved estimates divided by estimates given." />
          </h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {metrics?.conversionRate != null ? `${metrics.conversionRate.toFixed(1)}%` : "—"}
              </p>
              {(() => {
                const d = formatDelta(percentChange(metrics?.conversionRate, previousMetrics?.conversionRate));
                return d ? <p className={`mt-0.5 text-[11px] ${deltaToneClass(d.tone)}`}>{d.text}</p> : null;
              })()}
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Average Ticket" tooltip="Average approved estimate value." />
          </h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {metrics?.averageTicket != null ? formatCurrency(metrics.averageTicket) : "—"}
              </p>
              {(() => {
                const d = formatDelta(percentChange(metrics?.averageTicket, previousMetrics?.averageTicket));
                return d ? <p className={`mt-0.5 text-[11px] ${deltaToneClass(d.tone)}`}>{d.text}</p> : null;
              })()}
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Estimates Given" tooltip="Number of estimates assigned to you in the selected period." />
          </h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {metrics?.estimatesGiven ?? "—"}
              </p>
              {(() => {
                const d = formatDelta(percentChange(metrics?.estimatesGiven, previousMetrics?.estimatesGiven));
                return d ? <p className={`mt-0.5 text-[11px] ${deltaToneClass(d.tone)}`}>{d.text}</p> : null;
              })()}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
