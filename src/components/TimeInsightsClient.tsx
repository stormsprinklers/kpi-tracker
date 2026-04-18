"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PayrollExportPanel } from "@/components/PayrollExportPanel";
import { ExpectedPayTable } from "@/components/team/ExpectedPayTable";
import { usePayPeriodCalendar } from "@/hooks/usePayPeriodCalendar";
import { getPayPeriodRangeForOffsetN } from "@/lib/payPeriod";
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
  averageRevenuePerOnJobHour: number | null;
  averageRevenuePerLoggedHour: number | null;
  laborPercentOfRevenue: number | null;
}

export function TimeInsightsClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const payCal = usePayPeriodCalendar();
  const [periodOffset, setPeriodOffset] = useState(0);
  const [data, setData] = useState<TimeInsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(
    () => getPayPeriodRangeForOffsetN(periodOffset, payCal),
    [periodOffset, payCal]
  );

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Date range
          </span>
          {dateSelector}
        </div>
        {isAdmin && (
          <PayrollExportPanel
            startDate={range.startDate}
            endDate={range.endDate}
            excludeZeroHours
          />
        )}
      </div>

      {loading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!loading && !error && data && (
        <>
          {/* Main rollup metrics */}
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                  {data.averageRevenuePerOnJobHour != null
                    ? `$${data.averageRevenuePerOnJobHour.toFixed(2)}`
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <MetricTooltip
                    label="Avg RPH (on-the-job)"
                    tooltip="Uses timesheet hours tied to a job (job_hcp_id) when you have them; otherwise paid revenue on jobs with HCP start→complete timestamps divided by that on-site labor time. Field-only timesheet hours when using the clock."
                  />
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {data.averageRevenuePerLoggedHour != null
                    ? `$${data.averageRevenuePerLoggedHour.toFixed(2)}`
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <MetricTooltip
                    label="Avg RPH (overall)"
                    tooltip="Total paid revenue in this period divided by all timesheet hours logged by field staff (non-CSR). Includes training, shop, or other time not tied to a job."
                  />
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {data.laborPercentOfRevenue != null
                    ? `${data.laborPercentOfRevenue.toFixed(1)}%`
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <MetricTooltip
                    label="Labor % of revenue"
                    tooltip="Expected pay from field and technician Performance Pay plans divided by attributed technician revenue in this period. Office staff (CSR booking-rate) pay is excluded from this ratio but still listed in the expected pay table below."
                  />
                </p>
              </div>
            </div>
          </section>

          <ExpectedPayTable
            syncedStartDate={range.startDate}
            syncedEndDate={range.endDate}
            excludeZeroHours={false}
            includeTimesheetEmployees
            splitRegularOvertimeHours
            avgJobsPerDayByEmployee={Object.fromEntries(
              data.averageJobsPerDayPerTechnician.map((t) => [t.technicianId, t.avgJobsPerDay])
            )}
          />
        </>
      )}
    </div>
  );
}
