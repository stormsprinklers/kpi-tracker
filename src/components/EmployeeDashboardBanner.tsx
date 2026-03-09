"use client";

import { useCallback, useEffect, useState } from "react";
import { MetricTooltip } from "./MetricTooltip";

interface TimeEntry {
  id: string;
  entry_date: string;
  start_time: string | null;
  end_time: string | null;
}

function formatElapsed(entryDate: string, startTime: string): string {
  const now = new Date();
  const [y, mo, d] = entryDate.split("-").map(Number);
  const [h, m] = startTime.split(":").map(Number);
  const start = new Date(y, mo - 1, d, h, m, 0, 0);
  const ms = now.getTime() - start.getTime();
  if (ms < 0) return "0h 0m";
  const totalMins = Math.floor(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hours}h ${mins}m`;
}

export function EmployeeDashboardBanner({ hcpEmployeeId }: { hcpEmployeeId: string }) {
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expectedPay, setExpectedPay] = useState<number | null>(null);

  const today = new Date().toISOString().slice(0, 10);

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

  const fetchClockStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/timesheets?start_date=${today}&end_date=${today}`);
      if (!res.ok) throw new Error("Failed to load");
      const entries: TimeEntry[] = await res.json();
      const open = entries.find((e) => e.end_time == null);
      setActiveEntry(open ?? null);
      if (open?.start_time) setElapsed(formatElapsed(open.entry_date, open.start_time));
    } catch {
      setError("Could not load clock status");
      setActiveEntry(null);
    }
  }, [today]);

  useEffect(() => {
    fetchClockStatus();
  }, [fetchClockStatus]);

  useEffect(() => {
    if (!activeEntry?.start_time) return;
    const interval = setInterval(() => {
      setElapsed(formatElapsed(activeEntry.entry_date, activeEntry.start_time!));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeEntry?.id, activeEntry?.start_time]);

  async function handleClockIn() {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const res = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_date: today,
          start_time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to clock in");
      }
      await fetchClockStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clock in");
    } finally {
      setLoading(false);
    }
  }

  async function handleClockOut() {
    if (!activeEntry) return;
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const endTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const startParts = (activeEntry.start_time ?? "00:00").split(":").map(Number);
      const startDate = new Date();
      startDate.setHours(startParts[0], startParts[1], 0, 0);
      const hours = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      const res = await fetch(`/api/timesheets/${activeEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end_time: endTime, hours: Math.round(hours * 100) / 100 }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to clock out");
      }
      setActiveEntry(null);
      setElapsed("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clock out");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          {activeEntry ? (
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Clocked in</p>
                <p className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {elapsed}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClockOut}
                disabled={loading}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "…" : "Clock Out"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleClockIn}
                disabled={loading}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? "…" : "Clock In"}
              </button>
            </div>
          )}
          {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="border-l border-zinc-200 pl-4 dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <MetricTooltip
              label="Expected paycheck this period"
              tooltip="Estimated pay based on your Performance Pay config. Uses timesheets, technician revenue, or CSR KPIs depending on your role. Biweekly period."
            />
          </p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {expectedPay != null ? `$${expectedPay.toFixed(2)}` : "—"}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {expectedPay != null ? "Based on timesheets and metrics" : "Calculated when Performance Pay is configured"}
          </p>
        </div>
      </div>
    </section>
  );
}
