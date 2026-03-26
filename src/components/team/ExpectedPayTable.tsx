"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExpectedPayResult } from "@/lib/performancePay";
import { MetricTooltip } from "../MetricTooltip";

type ExpectedPayTableProps = {
  /**
   * When both are set, the table uses this range and hides its own date inputs
   * (e.g. Time Insights main date preset).
   */
  syncedStartDate?: string;
  syncedEndDate?: string;
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function ExpectedPayTable({
  syncedStartDate,
  syncedEndDate,
}: ExpectedPayTableProps = {}) {
  const isSynced =
    typeof syncedStartDate === "string" &&
    syncedStartDate.length > 0 &&
    typeof syncedEndDate === "string" &&
    syncedEndDate.length > 0;

  const [results, setResults] = useState<ExpectedPayResult[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getDefaultDates() {
    const now = new Date();
    const d = new Date(now);
    const day = d.getDay();
    const mon = 1;
    let daysBack = (day - mon + 7) % 7;
    if (day < mon) daysBack += 7;
    d.setDate(d.getDate() - daysBack);
    const start = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 13);
    const end = d.toISOString().slice(0, 10);
    return [start, end];
  }

  const fetchExpected = useCallback(async () => {
    let s = isSynced ? syncedStartDate! : startDate;
    let e = isSynced ? syncedEndDate! : endDate;
    if (!s || !e) {
      const [a, b] = getDefaultDates();
      s = a;
      e = b;
      if (!isSynced) {
        setStartDate(a);
        setEndDate(b);
      }
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/performance-pay/expected?startDate=${s}&endDate=${e}`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to load");
      }
      const data = (await res.json()) as { results: ExpectedPayResult[]; startDate: string; endDate: string };
      setResults(data.results ?? []);
      if (!isSynced) {
        setStartDate(data.startDate ?? s);
        setEndDate(data.endDate ?? e);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [isSynced, syncedStartDate, syncedEndDate, startDate, endDate]);

  useEffect(() => {
    fetchExpected();
  }, [fetchExpected]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Expected pay</h3>
        {!isSynced && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <span className="text-zinc-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={fetchExpected}
              disabled={loading || !startDate || !endDate}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "Loading…" : "Apply"}
            </button>
          </div>
        )}
        {isSynced && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {syncedStartDate} → {syncedEndDate}
          </p>
        )}
      </div>
      {error && (
        <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 pl-4 text-left font-medium text-zinc-700 dark:text-zinc-300">
                Employee
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Hours"
                  tooltip="Total hours from timesheets in this period."
                />
              </th>
              <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Pay type"
                  tooltip="Performance Pay structure: hourly, commission, hybrid, or CSR booking-based hourly."
                />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Effective $/hr"
                  tooltip="Expected pay divided by hours worked. Shows — if no hours are logged."
                />
              </th>
              <th className="pb-2 pr-4 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Expected pay"
                  tooltip="Estimated pay from Performance Pay config: timesheets × rate, revenue × commission, or metrics-based tiers."
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.hcpEmployeeId} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="py-2 pl-4 text-zinc-900 dark:text-zinc-50">
                  {r.employeeName ?? r.hcpEmployeeId}
                </td>
                <td className="py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                  {r.hoursWorked != null ? r.hoursWorked.toFixed(2) : "—"}
                </td>
                <td className="py-2 text-zinc-700 dark:text-zinc-300">{r.payTypeLabel ?? "—"}</td>
                <td className="py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                  {r.effectiveHourlyRate != null ? formatMoney(r.effectiveHourlyRate) : "—"}
                </td>
                <td className="py-2 pr-4 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatMoney(r.expectedPay)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {results.length === 0 && !loading && !error && (
        <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No expected pay data for this period. Set up Performance Pay first.
        </p>
      )}
    </div>
  );
}
