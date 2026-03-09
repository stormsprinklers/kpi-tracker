"use client";

import { useCallback, useEffect, useState } from "react";
import { MetricTooltip } from "./MetricTooltip";

interface TechnicianJobsPerDay {
  technicianId: string;
  technicianName: string;
  avgJobsPerDay: number;
}

interface LineItemTimeMetric {
  lineItemId?: string;
  name: string;
  avgMinutesPerUnit: number;
  jobCount: number;
}

interface TimeInsightsResult {
  averageJobsPerDayPerTechnician: TechnicianJobsPerDay[];
  averageDriveTimeMinutes: number | null;
  averageJobTimePerLineItem: LineItemTimeMetric[];
  excludedJobsCount: number;
}

type DatePreset = "all" | "7d" | "14d" | "30d" | "thisMonth" | "lastMonth" | "custom";

function getDateRange(preset: DatePreset, customStart?: string, customEnd?: string): { startDate?: string; endDate?: string } {
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

export function TimeInsightsClient() {
  const [datePreset, setDatePreset] = useState<DatePreset>("14d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [data, setData] = useState<TimeInsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const range = getDateRange(datePreset, customStartDate, customEndDate);
    const params = new URLSearchParams();
    if (range.startDate) params.set("startDate", range.startDate);
    if (range.endDate) params.set("endDate", range.endDate);
    const url = `/api/metrics/time-insights${params.toString() ? `?${params}` : ""}`;
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
  }, [datePreset, customStartDate, customEndDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dateSelector = (
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

          {/* 2. Average Drive Time */}
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <MetricTooltip
                label="Average Drive Time"
                tooltip="Average drive or travel time to jobs in minutes. Derived from job location and scheduling data when available."
              />
            </h3>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-700 dark:bg-zinc-900/50">
              <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {data.averageDriveTimeMinutes != null
                  ? `${data.averageDriveTimeMinutes} min`
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Average drive time to jobs
              </p>
            </div>
          </section>

          {/* 3. Average Job Time per Line Item */}
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <MetricTooltip
                label="Average Job Time per Line Item"
                tooltip="Average minutes spent per unit of each line item. Only jobs with a single line item type. Job duration divided by quantity."
              />
            </h3>
            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Only jobs with a single line item type. Job time divided by line item quantity.
            </p>
            {data.averageJobTimePerLineItem.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No single-line-item job data for this period.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-700">
                        <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Line Item</th>
                        <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                          <MetricTooltip label="Avg Min/Unit" tooltip="Average minutes of job time per unit of this line item." />
                        </th>
                        <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                          <MetricTooltip label="Jobs" tooltip="Number of jobs included in this average." />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.averageJobTimePerLineItem.map((item, idx) => (
                        <tr key={item.name + String(idx)} className="border-b border-zinc-100 dark:border-zinc-800">
                          <td className="py-2 text-zinc-900 dark:text-zinc-50">{item.name}</td>
                          <td className="py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                            {item.avgMinutesPerUnit.toFixed(1)} min
                          </td>
                          <td className="py-2 text-right text-zinc-700 dark:text-zinc-300">
                            {item.jobCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.excludedJobsCount > 0 && (
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {data.excludedJobsCount} jobs not included here due to multiple line items.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
