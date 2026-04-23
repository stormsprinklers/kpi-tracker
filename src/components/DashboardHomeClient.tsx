"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  DASHBOARD_PRESET_LABELS,
  DASHBOARD_PRESET_ORDER,
  type DashboardDatePreset,
  getDashboardDateRange,
} from "@/lib/dashboardDateRange";
import { usePayPeriodCalendar } from "@/hooks/usePayPeriodCalendar";
import { EmployeeDashboardBanner } from "./EmployeeDashboardBanner";
import { KeyMetricsSection } from "./KeyMetricsSection";
import { SalesmanMetricsSection } from "./SalesmanMetricsSection";
import { TechnicianRevenueSection } from "./TechnicianRevenueSection";
import { CsrKpisSection } from "./CsrKpisSection";

export function DashboardHomeClient({ connected }: { connected: boolean }) {
  const { data: session } = useSession();
  const [preset, setPreset] = useState<DashboardDatePreset>("thisPayPeriod");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const payPeriodCalendar = usePayPeriodCalendar();

  const dateRange = useMemo(
    () => getDashboardDateRange(preset, customStart, customEnd, payPeriodCalendar),
    [preset, customStart, customEnd, payPeriodCalendar]
  );
  const role = session?.user?.role;
  const isSalesman = role === "salesman";
  const isEmployeeLike = role === "employee" || role === "salesman";

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Time period</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DashboardDatePreset)}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
              aria-label="Dashboard time period"
            >
              {DASHBOARD_PRESET_ORDER.map((key) => (
                <option key={key} value={key}>
                  {DASHBOARD_PRESET_LABELS[key]}
                </option>
              ))}
            </select>
            {preset === "custom" && (
              <>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                  aria-label="Custom range start"
                />
                <span className="text-sm text-zinc-500">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                  aria-label="Custom range end"
                />
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{dateRange.rangeLabel}</p>
      </div>

      {isEmployeeLike && (
        <EmployeeDashboardBanner dateRange={dateRange} payPeriodCalendar={payPeriodCalendar} />
      )}

      {isSalesman ? (
        <SalesmanMetricsSection dateRange={dateRange} />
      ) : (
        <KeyMetricsSection
          connected={connected}
          dateRange={dateRange}
          payPeriodCalendar={payPeriodCalendar}
        />
      )}
      {connected && !isSalesman && <TechnicianRevenueSection dateRange={dateRange} />}
      {connected && !isSalesman && <CsrKpisSection dateRange={dateRange} />}
    </>
  );
}
