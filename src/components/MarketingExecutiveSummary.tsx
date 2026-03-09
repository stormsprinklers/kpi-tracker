"use client";

import { useState } from "react";
import { MetricTooltip } from "./MetricTooltip";

type DatePreset = "7d" | "14d" | "30d" | "thisMonth" | "lastMonth" | "all" | "custom";

const PRESET_LABELS: Record<DatePreset, string> = {
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  all: "All time",
  custom: "Custom range",
};

export function MarketingExecutiveSummary() {
  const [datePreset, setDatePreset] = useState<DatePreset>("14d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const showCustomInputs = datePreset === "custom";

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Executive Summary
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-zinc-300 dark:border-zinc-600">
            {(Object.keys(PRESET_LABELS) as DatePreset[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDatePreset(r)}
                className={`px-3 py-1.5 text-sm ${
                  datePreset === r
                    ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {PRESET_LABELS[r]}
              </button>
            ))}
          </div>
          {showCustomInputs && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <span className="text-zinc-500">–</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Total ad spend" tooltip="Sum of advertising costs across all connected ad platforms in the period. Connect Meta, Google Ads, etc. to sync." />
          </h3>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Connect ad platforms to sync</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total leads</h3>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Connect CRM to sync</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Total jobs" tooltip="Number of jobs created or completed in the period. From Housecall Pro sync." />
          </h3>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">From Housecall Pro</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip label="Total revenue" tooltip="Sum of paid job revenue from booked jobs in the period. From Housecall Pro." />
          </h3>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">—</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">From booked jobs</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">AI overview</h3>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          AI insights will appear here once connected to OpenAI.
        </p>
      </div>
    </section>
  );
}
