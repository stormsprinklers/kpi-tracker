"use client";

import { useCallback, useEffect, useState } from "react";
import { MetricTooltip } from "./MetricTooltip";
import Link from "next/link";

interface CallRecord {
  id: string;
  call_date: string;
  call_time: string | null;
  duration_seconds: number | null;
  customer_name: string | null;
  customer_city: string | null;
  transcript: string | null;
  booking_value: string;
  customer_phone: string | null;
  job_hcp_id?: string | null;
  job_debug?: Record<string, unknown> | null;
  call_debug?: Record<string, unknown> | null;
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
    return { startDate: start.toISOString().slice(0, 10), endDate: endLast.toISOString().slice(0, 10) };
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

function formatTime(t: string | null): string {
  if (!t) return "—";
  const parts = String(t).split(":");
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }
  return t;
}

export function CsrCallDetailClient({
  hcpEmployeeId,
  csrName,
}: {
  hcpEmployeeId: string;
  csrName: string;
}) {
  const [datePreset, setDatePreset] = useState<DatePreset>("14d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [records, setRecords] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const range = getDateRange(datePreset, customStartDate, customEndDate);
    const params = new URLSearchParams();
    params.set("hcpEmployeeId", hcpEmployeeId);
    if (range.startDate) params.set("startDate", range.startDate);
    if (range.endDate) params.set("endDate", range.endDate);
    try {
      const res = await fetch(`/api/metrics/call-records?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setRecords(data.records ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [hcpEmployeeId, datePreset, customStartDate, customEndDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Call log — {csrName}
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Date, time, customer, city, duration, booking value, transcript
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
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
              />
              <span className="text-sm text-zinc-500">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
              />
            </>
          )}
        </div>
      </div>

      {loading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {!loading && !error && records.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No calls for this period.
        </p>
      )}
      {!loading && !error && records.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Date</th>
                <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Time</th>
                <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Customer</th>
                <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">City</th>
                <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                  <MetricTooltip label="Duration" tooltip="Length of the call in minutes and seconds. From GHL call webhook duration_seconds." />
                </th>
                <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                  <MetricTooltip label="Booking" tooltip="Call outcome: won (booked), lost (no booking), or other. From GHL booking_value." />
                </th>
                <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Job</th>
                <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Job (debug)</th>
                <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Call (debug)</th>
              </tr>
            </thead>
            <tbody>
              {records.flatMap((r) => [
                <tr
                  key={r.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                    <td className="py-2 text-zinc-900 dark:text-zinc-50">
                      {r.call_date}
                    </td>
                    <td className="py-2 text-zinc-700 dark:text-zinc-300">
                      {formatTime(r.call_time)}
                    </td>
                    <td className="py-2 text-zinc-900 dark:text-zinc-50">
                      {r.customer_name ?? r.customer_phone ?? "—"}
                    </td>
                    <td className="py-2 text-zinc-700 dark:text-zinc-300">
                      {r.customer_city ?? "—"}
                    </td>
                    <td className="py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {r.duration_seconds != null
                        ? formatDuration(r.duration_seconds)
                        : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={
                          r.booking_value === "won"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : r.booking_value === "lost"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-zinc-500 dark:text-zinc-400"
                        }
                      >
                        {r.booking_value}
                      </span>
                    </td>
                    <td className="py-2 text-zinc-600 dark:text-zinc-400">
                      {r.job_hcp_id ? (
                        <span className="font-mono text-xs" title="Linked to HCP job for revenue tracking">
                          ✓ {r.job_hcp_id.slice(0, 8)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2">
                      {r.job_debug ? (
                        <button
                          type="button"
                          onClick={() => setExpandedJobId(expandedJobId === r.id ? null : r.id)}
                          className="text-xs text-amber-600 hover:underline dark:text-amber-400"
                        >
                          {expandedJobId === r.id ? "Hide" : "Show"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2">
                      {r.call_debug ? (
                        <button
                          type="button"
                          onClick={() => setExpandedCallId(expandedCallId === r.id ? null : r.id)}
                          className="text-xs text-amber-600 hover:underline dark:text-amber-400"
                        >
                          {expandedCallId === r.id ? "Hide" : "Show"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(expandedId === r.id ? null : r.id)
                        }
                        className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                      >
                        {expandedId === r.id ? "Hide transcript" : "Show transcript"}
                      </button>
                    </td>
                  </tr>,
                ...(expandedId === r.id && r.transcript
                  ? [
                      <tr
                        key={`${r.id}-transcript`}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td colSpan={10} className="bg-zinc-50 py-2 pl-4 dark:bg-zinc-900/50">
                          <p className="whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">
                            {r.transcript}
                          </p>
                        </td>
                      </tr>,
                    ]
                  : []),
                ...(expandedJobId === r.id && r.job_debug
                  ? [
                      <tr
                        key={`${r.id}-job-debug`}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td colSpan={10} className="bg-amber-50/50 py-2 pl-4 dark:bg-amber-950/20">
                          <div className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">Job (from jobs table / HCP webhook)</div>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-mono text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            {JSON.stringify(r.job_debug, null, 2)}
                          </pre>
                        </td>
                      </tr>,
                    ]
                  : []),
                ...(expandedCallId === r.id && r.call_debug
                  ? [
                      <tr
                        key={`${r.id}-call-debug`}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td colSpan={10} className="bg-sky-50/50 py-2 pl-4 dark:bg-sky-950/20">
                          <div className="mb-1 text-xs font-medium text-sky-700 dark:text-sky-400">Call headers (from GHL webhook)</div>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-mono text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            {JSON.stringify(r.call_debug, null, 2)}
                          </pre>
                        </td>
                      </tr>,
                    ]
                  : []),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
