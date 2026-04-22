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
        HCP jobs are attributed from lead source text and UTMs. Paid spend/CPL require ad integrations (LSA now, PPC/Meta
        coming next). Free channels show N/A for spend.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Lead source</th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Total spend"
                  tooltip="Definition: paid channel ad spend in selected range. Source/config: synced from connected ad integrations."
                />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Cost / lead"
                  tooltip={
                    defs.costPerLead
                      ? `Definition: ${defs.costPerLead} Source/config: requires spend + lead sync for the channel.`
                      : "Definition: spend divided by leads. Source/config: requires spend + lead sync for the channel."
                  }
                />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Booking rate"
                  tooltip="Definition: booked jobs divided by attributed jobs for this source. Source/config: Housecall Pro jobs + attribution mapping."
                />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Conversion rate"
                  tooltip="Definition: paid jobs divided by attributed jobs for this source. Source/config: synced paid amounts from Housecall Pro."
                />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Avg revenue"
                  tooltip="Definition: attributed paid revenue divided by paid jobs. Source/config: Housecall Pro revenue + attribution setup."
                />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Total revenue"
                  tooltip="Definition: total attributed paid revenue. Source/config: Housecall Pro jobs mapped by attribution rules."
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="py-4 text-zinc-500 dark:text-zinc-400">
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
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
