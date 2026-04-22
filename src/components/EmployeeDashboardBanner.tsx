"use client";

import { useEffect, useMemo, useState } from "react";
import {
  clampDashboardRangeEndToTodayInOrgTz,
  type DashboardDateRange,
} from "@/lib/dashboardDateRange";
import type { PayPeriodCalendarSettings } from "@/lib/payPeriod";
import { MetricTooltip } from "./MetricTooltip";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function EmployeeDashboardBanner({
  dateRange,
  payPeriodCalendar,
}: {
  dateRange: DashboardDateRange;
  payPeriodCalendar: PayPeriodCalendarSettings;
}) {
  const [expectedPay, setExpectedPay] = useState<number | null>(null);
  const [effectiveHourly, setEffectiveHourly] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);

  const metricsRange = useMemo(
    () => clampDashboardRangeEndToTodayInOrgTz(dateRange, payPeriodCalendar),
    [dateRange, payPeriodCalendar]
  );

  const expectedUrl = useMemo(() => {
    if (metricsRange.isAllTime || !metricsRange.startDate || !metricsRange.endDate) {
      return "/api/performance-pay/expected";
    }
    const p = new URLSearchParams({
      startDate: metricsRange.startDate,
      endDate: metricsRange.endDate,
    });
    return `/api/performance-pay/expected?${p.toString()}`;
  }, [metricsRange]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(expectedUrl);
        if (cancelled) return;
        if (!res.ok) {
          setExpectedPay(null);
          setEffectiveHourly(null);
          setPeriodStart(null);
          setPeriodEnd(null);
          return;
        }
        const data = (await res.json()) as {
          results?: { expectedPay: number; effectiveHourlyRate: number | null }[];
          startDate?: string;
          endDate?: string;
        };
        if (cancelled) return;
        const row = data.results?.[0];
        const pay = row?.expectedPay;
        setExpectedPay(typeof pay === "number" ? pay : null);
        const eff = row?.effectiveHourlyRate;
        setEffectiveHourly(typeof eff === "number" && !Number.isNaN(eff) ? eff : null);
        setPeriodStart(typeof data.startDate === "string" ? data.startDate : null);
        setPeriodEnd(typeof data.endDate === "string" ? data.endDate : null);
      } catch {
        if (cancelled) return;
        setExpectedPay(null);
        setEffectiveHourly(null);
        setPeriodStart(null);
        setPeriodEnd(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expectedUrl]);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Your pay (this view)
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {periodStart && periodEnd ? (
              <>
                {periodStart} → {periodEnd}
              </>
            ) : (
              metricsRange.rangeLabel
            )}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip
              label="Expected gross pay"
              tooltip="Estimated gross pay for the selected date range based on your Performance Pay configuration, timesheets, and period activity."
            />
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {expectedPay != null ? formatMoney(expectedPay) : "—"}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip
              label="Effective $/hr"
              tooltip="Expected gross pay divided by hours worked in this range. Shows — when there are no logged hours."
            />
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {effectiveHourly != null ? `${formatMoney(effectiveHourly)}/hr` : "—"}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        {expectedPay != null
          ? "Includes configured bonuses where applicable. Not a paycheck or tax quote."
          : "Set up Performance Pay and link this account to your HCP employee to see an estimate."}
      </p>
    </section>
  );
}
