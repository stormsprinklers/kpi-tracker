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

export function KeyMetricsSection({
  connected,
  dateRange,
}: {
  connected: boolean;
  dateRange: DashboardDateRange;
}) {
  const [metrics, setMetrics] = useState<KeyMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(keyMetricsUrl(dateRange));
      if (!res.ok) throw new Error("Failed to load metrics");
      const data = await res.json();
      setMetrics(data);
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
              <MetricTooltip label="Jobs" tooltip="Number of paid or completed jobs in the period. Counted by job date (completed, scheduled, or created)." />
            </h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Connect Housecall Pro to sync</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip label="Revenue" tooltip="Total paid amount from jobs and invoices in the period. Uses job paid amount minus outstanding balance." />
            </h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Connect Housecall Pro to sync</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip label="Avg. Job Value" tooltip="Average revenue per job. Calculated as total revenue divided by job count in the period." />
            </h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Connect Housecall Pro to sync</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <MetricTooltip label="Conversion Rate" tooltip="Share of estimates that become approved jobs. Calculated as (estimates with approved option / total estimates) × 100." />
            </h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Connect Housecall Pro to sync</p>
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
            <MetricTooltip label="Jobs" tooltip="Number of paid or completed jobs in the period. Counted by job date (completed, scheduled, or created)." />
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
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{dateRange.rangeLabel}</p>
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
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{dateRange.rangeLabel}</p>
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
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{dateRange.rangeLabel}</p>
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
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{dateRange.rangeLabel}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
