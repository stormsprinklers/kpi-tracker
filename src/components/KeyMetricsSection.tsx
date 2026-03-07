"use client";

import { useCallback, useEffect, useState } from "react";

interface KeyMetrics {
  jobsThisWeek: number;
  revenueThisWeek: number;
  avgJobValue: number | null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function KeyMetricsSection({ connected }: { connected: boolean }) {
  const [metrics, setMetrics] = useState<KeyMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/metrics/key-metrics");
      if (!res.ok) throw new Error("Failed to load metrics");
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (!connected) {
    return (
      <section>
        <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Key Metrics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Jobs This Week</h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Connect Housecall Pro to sync</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Revenue</h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Connect Housecall Pro to sync</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Avg. Job Value</h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Connect Housecall Pro to sync</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Key Metrics
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Jobs This Week</h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {metrics?.jobsThisWeek ?? "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Last 7 days</p>
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Revenue</h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {metrics != null ? formatCurrency(metrics.revenueThisWeek) : "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Last 7 days</p>
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Avg. Job Value</h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {metrics?.avgJobValue != null ? formatCurrency(metrics.avgJobValue) : "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Last 7 days</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
