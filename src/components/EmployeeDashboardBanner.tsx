"use client";

import { useCallback, useEffect, useState } from "react";
import { MetricTooltip } from "./MetricTooltip";

export function EmployeeDashboardBanner() {
  const [expectedPay, setExpectedPay] = useState<number | null>(null);

  const fetchExpectedPay = useCallback(async () => {
    try {
      const res = await fetch("/api/performance-pay/expected");
      if (!res.ok) return;
      const data = (await res.json()) as { results?: { expectedPay: number }[] };
      const pay = data.results?.[0]?.expectedPay;
      setExpectedPay(typeof pay === "number" ? pay : null);
    } catch {
      setExpectedPay(null);
    }
  }, []);

  useEffect(() => {
    fetchExpectedPay();
  }, [fetchExpectedPay]);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        <MetricTooltip
          label="Expected gross pay (pay period)"
          tooltip="Estimated gross pay for the current pay period based on your Performance Pay configuration and period activity."
        />
      </p>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {expectedPay != null ? `$${expectedPay.toFixed(2)}` : "—"}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {expectedPay != null ? "Based on timesheets and metrics" : "Calculated when Performance Pay is configured"}
      </p>
    </section>
  );
}
