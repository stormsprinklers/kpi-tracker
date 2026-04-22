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

function cellSpend(spendApplicable: boolean, v: number | null): string {
  if (!spendApplicable) return "N/A";
  if (v == null) return "—";
  return formatMoney(v);
}

function cellRate(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

export function MarketingLeadSourceTable({
  overview,
  loading,
  isAdmin,
}: {
  overview: MarketingOverviewResponse | null;
  loading: boolean;
  isAdmin: boolean;
}) {
  const channels = overview?.channels ?? [];
  const defs = overview?.metricDefinitions ?? {};

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Performance by lead source
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        HCP jobs are attributed from lead source text and UTMs. Paid spend/CPL need LSA sync
        (or temporary manual LSA upload in Attribution setup, or future Ads integrations). Free channels show N/A for spend
        and substitute GBP / Search Console metrics where available.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Lead source</th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip label="Total spend" tooltip="Paid channels only; from synced platform data." />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip label="Cost / lead" tooltip={defs.costPerLead ?? ""} />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Booking rate"
                  tooltip="Booked jobs ÷ attributed jobs in period for this channel."
                />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Conversion rate"
                  tooltip="Paid jobs ÷ attributed jobs in period for this channel."
                />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip label="Avg revenue" tooltip="Attributed paid revenue ÷ paid jobs." />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip label="Total revenue" tooltip="Attributed paid job revenue (HCP)." />
              </th>
              <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Signals</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="py-4 text-zinc-500 dark:text-zinc-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading &&
              channels.map((c) => (
                <tr key={c.slug} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 text-zinc-900 dark:text-zinc-50">
                    <div className="flex flex-col gap-1">
                      <span>{c.label}</span>
                      {isAdmin && c.slug === "google_lsa" && (
                        <span className="text-xs text-zinc-500">
                          Admin: connect OAuth via /api/marketing/integrations/lsa or use temporary manual
                          LSA CSV + spend upload in Attribution setup.
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {cellSpend(c.spendApplicable, c.spend)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {c.spendApplicable && c.costPerLead != null ? formatMoney(c.costPerLead) : c.spendApplicable ? "—" : "N/A"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {cellRate(c.bookingRate)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {cellRate(c.conversionRate)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {c.avgRevenue != null ? formatMoney(c.avgRevenue) : "—"}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                    {formatMoney(c.totalRevenue)}
                  </td>
                  <td className="max-w-[200px] py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {c.slug === "google_business_profile" && (
                      <>
                        Calls {c.substituteMetrics.gbpCallClicks ?? 0}, directions{" "}
                        {c.substituteMetrics.gbpDirectionRequests ?? 0}, web{" "}
                        {c.substituteMetrics.gbpWebsiteClicks ?? 0}, impr.{" "}
                        {c.substituteMetrics.gbpImpressionsSum ?? 0}, reviews{" "}
                        {c.substituteMetrics.reviewCount ?? 0}
                      </>
                    )}
                    {c.slug === "organic_search" && (
                      <>
                        GSC clicks {c.substituteMetrics.searchConsoleClicks ?? 0}, impr.{" "}
                        {c.substituteMetrics.searchConsoleImpressions ?? 0} (organic rankings below)
                      </>
                    )}
                    {c.slug !== "google_business_profile" && c.slug !== "organic_search" && (
                      <span>Jobs: {c.attributedJobs}</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
