"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MetricTooltip } from "./MetricTooltip";

interface EmployeeCallStats {
  hcpEmployeeId: string | null;
  employeeName: string;
  totalOpportunityCalls: number;
  won: number;
  lost: number;
  bookingRatePercent: number | null;
  avgDurationSeconds: number | null;
  avgBookedCallRevenue: number | null;
}

interface CallInsightsResult {
  avgWaitingWindowDays: number | null;
  byEmployee: EmployeeCallStats[];
}

type DatePreset = "7d" | "14d" | "30d" | "thisMonth" | "lastMonth" | "all" | "custom";

function getDateRange(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string
): { startDate?: string; endDate?: string } {
  const today = new Date();
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  const endStr = end.toISOString().slice(0, 10);

  if (preset === "custom" && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd };
  }
  if (preset === "custom") return {};
  if (preset === "all") return {};
  if (preset === "7d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 7);
    return { startDate: start.toISOString().slice(0, 10), endDate: endStr };
  }
  if (preset === "14d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 14);
    return { startDate: start.toISOString().slice(0, 10), endDate: endStr };
  }
  if (preset === "30d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    return { startDate: start.toISOString().slice(0, 10), endDate: endStr };
  }
  if (preset === "thisMonth") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { startDate: start.toISOString().slice(0, 10), endDate: endStr };
  }
  if (preset === "lastMonth") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endLast = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: endLast.toISOString().slice(0, 10),
    };
  }
  return {};
}

const PRESET_LABELS: Record<DatePreset, string> = {
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  all: "All time",
  custom: "Custom range",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function CallInsightsClient() {
  const [datePreset, setDatePreset] = useState<DatePreset>("14d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [data, setData] = useState<CallInsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const range = getDateRange(datePreset, customStartDate, customEndDate);
    const params = new URLSearchParams();
    if (range.startDate) params.set("startDate", range.startDate);
    if (range.endDate) params.set("endDate", range.endDate);
    const url = `/api/metrics/call-insights${params.toString() ? `?${params}` : ""}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load call insights");
      const result: CallInsightsResult = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [datePreset, customStartDate, customEndDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <>
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          <MetricTooltip
            label="Average Waiting Window"
            tooltip="Average days between when a customer called and their scheduled appointment date. From calls with linked jobs in the selected period."
          />
        </h3>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Avg. days between call date and appointment date (calls with linked jobs). Uses the date range selected below.
        </p>
        <div className="rounded-lg bg-zinc-50/50 py-4 dark:bg-zinc-900/50">
          <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {loading ? "—" : data?.avgWaitingWindowDays != null
              ? `${data.avgWaitingWindowDays.toFixed(1)} days`
              : "—"}
          </p>
          {!loading && data?.avgWaitingWindowDays == null && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              No calls with linked appointments in this period.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          AI Analysis
        </h3>
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            AI analysis will appear here. Configure automations to populate insights.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Booking Rate per Employee
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Opportunity calls (won + lost) and booking rate. Data from GoHighLevel call webhooks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {(Object.keys(PRESET_LABELS) as DatePreset[]).map((key) => (
                <option key={key} value={key}>
                  {PRESET_LABELS[key]}
                </option>
              ))}
            </select>
            {datePreset === "custom" && (
              <>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                />
                <span className="text-sm text-zinc-500">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                />
              </>
            )}
          </div>
        </div>

        {loading && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
        )}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {!loading && !error && data && data.byEmployee.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No call data for this period. Configure GoHighLevel to send call webhooks to populate.
          </p>
        )}
        {!loading && !error && data && data.byEmployee.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Employee</th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                    <MetricTooltip label="Opportunity Calls" tooltip="Calls where the customer had a decision (won or lost). From GoHighLevel call webhooks with booking_value won or lost." />
                  </th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                    <MetricTooltip label="Won" tooltip="Number of opportunity calls that resulted in a booked appointment." />
                  </th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                    <MetricTooltip label="Lost" tooltip="Number of opportunity calls that did not result in a booking." />
                  </th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                    <MetricTooltip label="Booking Rate" tooltip="Percentage of opportunity calls that turned into bookings. (Won / Opportunity Calls) × 100." />
                  </th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                    <MetricTooltip label="Avg Duration" tooltip="Average call length in minutes and seconds. From duration_seconds on call records." />
                  </th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                    <MetricTooltip label="Avg Booked Revenue" tooltip="Average job total_amount for won calls with linked jobs. Reflects value of booked calls." />
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byEmployee.map((row) => (
                  <tr
                    key={row.hcpEmployeeId ?? row.employeeName}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-2 text-zinc-900 dark:text-zinc-50">
                      {row.hcpEmployeeId ? (
                        <Link
                          href={`/call-insights/csr/${row.hcpEmployeeId}`}
                          className="font-medium hover:underline"
                        >
                          {row.employeeName}
                        </Link>
                      ) : (
                        row.employeeName
                      )}
                    </td>
                    <td className="py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                      {row.totalOpportunityCalls}
                    </td>
                    <td className="py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {row.won}
                    </td>
                    <td className="py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {row.lost}
                    </td>
                    <td className="py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                      {row.bookingRatePercent != null
                        ? `${row.bookingRatePercent.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {row.avgDurationSeconds != null
                        ? formatDuration(row.avgDurationSeconds)
                        : "—"}
                    </td>
                    <td className="py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                      {row.avgBookedCallRevenue != null
                        ? `$${row.avgBookedCallRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
