"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { MarketingOverviewResponse } from "@/lib/marketing/types";
import { MarketingExecutiveSummary } from "./MarketingExecutiveSummary";
import { MarketingLeadSourceTable } from "./MarketingLeadSourceTable";
import { MarketingSeoInsights } from "./MarketingSeoInsights";

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

function rangeForPreset(
  preset: DatePreset,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  const today = new Date();
  const endStr = today.toISOString().slice(0, 10);
  if (preset === "all") {
    return { start: "2000-01-01", end: endStr };
  }
  if (preset === "custom" && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  const endS = end.toISOString().slice(0, 10);
  const start = new Date(today);
  if (preset === "7d") start.setDate(start.getDate() - 7);
  else if (preset === "14d") start.setDate(start.getDate() - 14);
  else if (preset === "30d") start.setDate(start.getDate() - 30);
  else if (preset === "thisMonth") {
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: s.toISOString().slice(0, 10), end: endStr };
  } else if (preset === "lastMonth") {
    start.setMonth(start.getMonth() - 1, 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: start.toISOString().slice(0, 10), end: lastDay.toISOString().slice(0, 10) };
  } else {
    start.setDate(start.getDate() - 14);
  }
  return { start: start.toISOString().slice(0, 10), end: endS };
}

export function MarketingInsightsClient() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [preset, setPreset] = useState<DatePreset>("14d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [overview, setOverview] = useState<MarketingOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [manualLsaSpend, setManualLsaSpend] = useState("");
  const [manualLsaCsv, setManualLsaCsv] = useState<File | null>(null);
  const [manualLsaBusy, setManualLsaBusy] = useState(false);

  const { start, end } = rangeForPreset(preset, customStart, customEnd);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/marketing/overview?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Failed to load marketing overview");
      }
      const data = (await res.json()) as MarketingOverviewResponse;
      setOverview(data);
    } catch (e) {
      setOverview(null);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    load();
  }, [load]);

  const postSync = async (path: string, label: string) => {
    setSyncMsg(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: start, endDate: end }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) {
        setSyncMsg(`${label}: ${data.error ?? res.statusText}`);
        return;
      }
      setSyncMsg(data.message ?? `${label} sync completed.`);
      await load();
    } catch (e) {
      setSyncMsg(`${label}: ${e instanceof Error ? e.message : "failed"}`);
    }
  };

  const uploadManualLsa = async () => {
    if (!manualLsaCsv) {
      setSyncMsg("Manual LSA: choose a CSV export file first.");
      return;
    }
    setManualLsaBusy(true);
    setSyncMsg(null);
    try {
      const fd = new FormData();
      fd.append("startDate", start);
      fd.append("endDate", end);
      fd.append("totalSpend", manualLsaSpend.trim() || "0");
      fd.append("leadsCsv", manualLsaCsv);
      const res = await fetch("/api/marketing/sync/lsa-manual", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) {
        setSyncMsg(`Manual LSA: ${data.error ?? res.statusText}`);
        return;
      }
      setSyncMsg(data.message ?? "Manual LSA data saved.");
      await load();
    } catch (e) {
      setSyncMsg(`Manual LSA: ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      setManualLsaBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Reporting period</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {start} → {end} (attribution and marts refresh on each load)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded border border-zinc-300 dark:border-zinc-600">
            {(Object.keys(PRESET_LABELS) as DatePreset[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setPreset(r)}
                className={`px-2.5 py-1.5 text-xs sm:text-sm ${
                  preset === r
                    ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {PRESET_LABELS[r]}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <span className="text-zinc-500">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
          )}
        </div>
        {isAdmin && (
          <div className="flex w-full flex-col gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800 sm:border-t-0 sm:pt-0">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => postSync("/api/marketing/sync/lsa", "LSA")}
                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Sync LSA spend/leads
              </button>
              <button
                type="button"
                onClick={() => postSync("/api/marketing/sync/gbp-performance", "GBP performance")}
                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Sync GBP metrics
              </button>
              <button
                type="button"
                onClick={() => postSync("/api/marketing/sync/search-console", "Search Console")}
                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Search Console (placeholder)
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-2 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900/40">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Temporary manual LSA input:
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={manualLsaSpend}
                onChange={(e) => setManualLsaSpend(e.target.value)}
                placeholder="Total ad spend (USD)"
                className="w-44 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <input
                type="file"
                accept=".csv,text/csv,text/tab-separated-values,.tsv"
                onChange={(e) => setManualLsaCsv(e.target.files?.[0] ?? null)}
                className="max-w-[260px] text-xs text-zinc-600 dark:text-zinc-300"
              />
              <button
                type="button"
                onClick={uploadManualLsa}
                disabled={manualLsaBusy}
                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {manualLsaBusy ? "Uploading…" : "Upload manual LSA CSV"}
              </button>
            </div>
          </div>
        )}
        {syncMsg && (
          <p className="w-full text-xs text-zinc-600 dark:text-zinc-400">{syncMsg}</p>
        )}
      </div>

      <MarketingExecutiveSummary
        overview={overview}
        loading={loading}
        error={error}
        rangeLabel={`${start} → ${end}`}
      />
      <MarketingLeadSourceTable overview={overview} loading={loading} isAdmin={isAdmin} />
      <MarketingSeoInsights />
    </>
  );
}
