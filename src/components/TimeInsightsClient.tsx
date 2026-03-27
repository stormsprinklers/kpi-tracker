"use client";

import { useCallback, useEffect, useState } from "react";
import { ExpectedPayTable } from "@/components/team/ExpectedPayTable";
import { MetricTooltip } from "./MetricTooltip";

interface TechnicianJobsPerDay {
  technicianId: string;
  technicianName: string;
  avgJobsPerDay: number;
}

interface TimeInsightsResult {
  averageJobsPerDayPerTechnician: TechnicianJobsPerDay[];
  averageDriveTimeMinutes: number | null;
  averageLaborTimeMinutes: number | null;
  averageRevenuePerJob: number | null;
  averageRevenuePerHour: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PAY_PERIOD_DAYS = 14;
const ANCHOR_START = "2026-03-21"; // First period: 2026-03-21 -> 2026-04-03

function parseYmdUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((v) => Number(v));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function formatYmdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getBiweeklyRange(periodOffset = 0): { startDate: string; endDate: string } {
  const anchor = parseYmdUtc(ANCHOR_START);
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffDays = Math.floor((todayUtc.getTime() - anchor.getTime()) / DAY_MS);
  const currentPeriodIndex = Math.floor(diffDays / PAY_PERIOD_DAYS);
  const periodIndex = currentPeriodIndex + periodOffset;
  const start = new Date(anchor.getTime() + periodIndex * PAY_PERIOD_DAYS * DAY_MS);
  const end = new Date(start.getTime() + (PAY_PERIOD_DAYS - 1) * DAY_MS);
  return { startDate: formatYmdUtc(start), endDate: formatYmdUtc(end) };
}

export function TimeInsightsClient() {
  const [periodOffset, setPeriodOffset] = useState(0);
  const [data, setData] = useState<TimeInsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const range = getBiweeklyRange(periodOffset);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("startDate", range.startDate);
    params.set("endDate", range.endDate);
    const url = `/api/metrics/time-insights?${params.toString()}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load time insights");
      const result: TimeInsightsResult = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [range.endDate, range.startDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dateSelector = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setPeriodOffset((prev) => prev - 1)}
        className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
      >
        Prev
      </button>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        {range.startDate} to {range.endDate}
      </p>
      <button
        type="button"
        onClick={() => setPeriodOffset((prev) => prev + 1)}
        className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
      >
        Next
      </button>
      <button
        type="button"
        onClick={() => setPeriodOffset(0)}
        className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
      >
        Current period
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Date range
        </span>
        {dateSelector}
      </div>

      {loading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!loading && !error && data && (
        <>
          {/* 1. Average Jobs per Day per Technician */}
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <MetricTooltip
                label="Average Jobs per Day per Technician"
                tooltip="Average number of jobs completed per working day per technician. Based on job assignments and job dates."
              />
            </h3>
            {data.averageJobsPerDayPerTechnician.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No technician data for this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[280px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Technician</th>
                      <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                        <MetricTooltip label="Avg Jobs/Day" tooltip="Average jobs completed per working day for this technician in the period." />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.averageJobsPerDayPerTechnician.map((t) => (
                      <tr key={t.technicianId} className="border-b border-zinc-100 dark:border-zinc-800">
                        <td className="py-2 text-zinc-900 dark:text-zinc-50">{t.technicianName}</td>
                        <td className="py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                          {t.avgJobsPerDay.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 2. Rollup Averages */}
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {data.averageDriveTimeMinutes != null ? `${data.averageDriveTimeMinutes} min` : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <MetricTooltip
                    label="Average Drive Time"
                    tooltip="Average drive or travel time to jobs in minutes."
                  />
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {data.averageLaborTimeMinutes != null ? `${data.averageLaborTimeMinutes} min` : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <MetricTooltip
                    label="Average Labor Time"
                    tooltip="Average on-site labor time from job start to completion."
                  />
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {data.averageRevenuePerJob != null ? `$${data.averageRevenuePerJob.toFixed(2)}` : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <MetricTooltip
                    label="Average Revenue per Job"
                    tooltip="Average paid revenue per paid job in the selected period."
                  />
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {data.averageRevenuePerHour != null ? `$${data.averageRevenuePerHour.toFixed(2)}` : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <MetricTooltip
                    label="Average Revenue per Hour"
                    tooltip="Paid revenue divided by total logged labor hours from job start/completion timestamps."
                  />
                </p>
              </div>
            </div>
          </section>

          <ExpectedPayTable
            syncedStartDate={range.startDate}
            syncedEndDate={range.endDate}
          />
        </>
      )}
    </div>
  );
}
