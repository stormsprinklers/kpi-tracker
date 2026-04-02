"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardDateRange } from "@/lib/dashboardDateRange";
import { MetricTooltip } from "./MetricTooltip";

interface KeyMetrics {
  jobCount: number;
  revenue: number;
  avgJobValue: number | null;
  conversionRate: number | null;
}

type MetricDeltaTone = "positive" | "negative" | "neutral";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function keyMetricsUrl(dateRange: DashboardDateRange): string {
  if (dateRange.isAllTime) {
    return "/api/metrics/key-metrics?range=all";
  }
  const params = new URLSearchParams();
  params.set("startDate", dateRange.startDate!);
  params.set("endDate", dateRange.endDate!);
  return `/api/metrics/key-metrics?${params}`;
}

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

export function KeyMetricsSection({
  connected,
  dateRange,
}: {
  connected: boolean;
  dateRange: DashboardDateRange;
}) {
  const [metrics, setMetrics] = useState<KeyMetrics | null>(null);
  const [previousMetrics, setPreviousMetrics] = useState<KeyMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const prevRange = previousDateRange(dateRange);
      const [currentRes, previousRes] = await Promise.all([
        fetch(keyMetricsUrl(dateRange)),
        prevRange ? fetch(keyMetricsUrl(prevRange)) : Promise.resolve(null),
      ]);

      if (!currentRes.ok) throw new Error("Failed to load metrics");
      const currentData = (await currentRes.json()) as KeyMetrics;
      setMetrics(currentData);

      if (previousRes && previousRes.ok) {
        const prevData = (await previousRes.json()) as KeyMetrics;
        setPreviousMetrics(prevData);
      } else {
        setPreviousMetrics(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [connected, dateRange]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (!connected) {
    return (
      <section>
        <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Key Metrics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip label="Jobs" tooltip="Number of paid or completed jobs in the period. Counted by job date (completed, then scheduled)." />
            </h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip label="Revenue" tooltip="Total paid amount from jobs and invoices in the period. Uses job paid amount minus outstanding balance." />
            </h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip label="Avg. Job Value" tooltip="Average revenue per job. Calculated as total revenue divided by job count in the period." />
            </h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip label="Conversion Rate" tooltip="Share of estimates that become approved jobs. Calculated as (estimates with approved option / total estimates) × 100." />
            </h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Key Metrics
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Jobs" tooltip="Number of paid or completed jobs in the period. Counted by job date (completed, then scheduled)." />
          </h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {metrics?.jobCount ?? "—"}
              </p>
              {(() => {
                const delta = formatDelta(percentChange(metrics?.jobCount, previousMetrics?.jobCount));
                return delta ? (
                  <p className={`mt-0.5 text-[11px] ${deltaToneClass(delta.tone)}`}>{delta.text}</p>
                ) : null;
              })()}
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Revenue" tooltip="Total paid amount from jobs and invoices in the period. Uses job paid amount minus outstanding balance." />
          </h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {metrics != null ? formatCurrency(metrics.revenue) : "—"}
              </p>
              {(() => {
                const delta = formatDelta(percentChange(metrics?.revenue, previousMetrics?.revenue));
                return delta ? (
                  <p className={`mt-0.5 text-[11px] ${deltaToneClass(delta.tone)}`}>{delta.text}</p>
                ) : null;
              })()}
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Avg. Job Value" tooltip="Average revenue per job. Calculated as total revenue divided by job count in the period." />
          </h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {metrics?.avgJobValue != null ? formatCurrency(metrics.avgJobValue) : "—"}
              </p>
              {(() => {
                const delta = formatDelta(percentChange(metrics?.avgJobValue, previousMetrics?.avgJobValue));
                return delta ? (
                  <p className={`mt-0.5 text-[11px] ${deltaToneClass(delta.tone)}`}>{delta.text}</p>
                ) : null;
              })()}
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Conversion Rate" tooltip="Share of estimates that become approved jobs. Calculated as (estimates with approved option / total estimates) × 100." />
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
                const delta = formatDelta(percentChange(metrics?.conversionRate, previousMetrics?.conversionRate));
                return delta ? (
                  <p className={`mt-0.5 text-[11px] ${deltaToneClass(delta.tone)}`}>{delta.text}</p>
                ) : null;
              })()}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
