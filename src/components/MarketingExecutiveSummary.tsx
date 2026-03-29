"use client";

import type { MarketingOverviewResponse } from "@/lib/marketing/types";
import { MetricTooltip } from "./MetricTooltip";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function MarketingExecutiveSummary({
  overview,
  loading,
  error,
  rangeLabel,
}: {
  overview: MarketingOverviewResponse | null;
  loading: boolean;
  error: string | null;
  rangeLabel: string;
}) {
  const ex = overview?.executive;
  const defs = overview?.metricDefinitions ?? {};
  const integ = overview?.integrations;

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Executive Summary
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{rangeLabel}</p>
        {integ && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            HCP: {integ.hcpConnected ? "connected" : "not connected"} · LSA:{" "}
            {integ.lsa.connected ? "connected" : "not connected"}
            {integ.lsa.lastError ? ` (${integ.lsa.lastError.slice(0, 80)}…)` : ""} · GBP:{" "}
            {integ.gbp.connected ? "connected" : "not connected"} · GSC:{" "}
            {integ.searchConsole.configured ? "site URL set" : "not configured"}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Total ad spend" tooltip={defs.totalSpend ?? ""} />
          </h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {ex?.totalSpend != null ? formatMoney(ex.totalSpend) : "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {ex?.totalSpend == null ? "Sync LSA or connect paid sources" : "Paid platforms"}
              </p>
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Platform leads" tooltip={defs.totalPlatformLeads ?? ""} />
          </h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {ex?.totalPlatformLeads != null ? Math.round(ex.totalPlatformLeads) : "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                From ad platforms (e.g. LSA charged leads)
              </p>
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Jobs (period)" tooltip={defs.totalJobsInPeriod ?? ""} />
          </h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {ex?.totalJobsInPeriod ?? "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Unassigned: {ex?.unassignedJobCount ?? 0} ({ex?.unassignedShare ?? 0}%)
              </p>
            </>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Paid revenue (period)" tooltip={defs.totalPaidRevenueInPeriod ?? ""} />
          </h3>
          {loading ? (
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {ex != null ? formatMoney(ex.totalPaidRevenueInPeriod) : "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Attributed: {ex != null ? formatMoney(ex.attributedPaidRevenue) : "—"}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">AI overview</h3>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Open the AI insights panel for this app (Marketing dashboard type) to generate commentary from
          live marketing context, channel mix, and SEO samples. Requires{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">OPENAI_API_KEY</code>.
        </p>
      </div>
    </section>
  );
}
