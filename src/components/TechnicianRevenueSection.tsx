"use client";

import { useCallback, useEffect, useState } from "react";

interface TechnicianRevenue {
  technicianId: string;
  technicianName: string;
  totalRevenue: number;
  conversionRate: number | null;
}

interface TechnicianRevenueResult {
  technicians: TechnicianRevenue[];
  totalRevenue: number;
}

type DatePreset = "all" | "7d" | "14d" | "30d" | "thisMonth" | "lastMonth";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getDateRange(preset: DatePreset): { startDate?: string; endDate?: string } {
  const today = new Date();
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  const endStr = end.toISOString().slice(0, 10);

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

export function TechnicianRevenueSection() {
  const [data, setData] = useState<TechnicianRevenueResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const { startDate, endDate } = getDateRange(datePreset);
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const url = `/api/metrics/technician-revenue${params.toString() ? `?${params}` : ""}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [datePreset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const presetLabels: Record<DatePreset, string> = {
    all: "All time",
    "7d": "Last 7 days",
    "14d": "Last 14 days",
    "30d": "Last 30 days",
    thisMonth: "This month",
    lastMonth: "Last month",
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Technician Revenue
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Total revenue by technician (from jobs paid or invoices paid)
          </p>
        </div>
        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value as DatePreset)}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
        >
          {(Object.keys(presetLabels) as DatePreset[]).map((key) => (
            <option key={key} value={key}>
              {presetLabels[key]}
            </option>
          ))}
        </select>
      </div>
      {loading && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {!loading && !error && (!data || data.technicians.length === 0) && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          No technician revenue data for this period. Connect Housecall Pro and
          ensure jobs are marked paid or have paid invoices.
        </p>
      )}
      {!loading && !error && data && data.technicians.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">
                    Technician
                  </th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                    Revenue
                  </th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                    Conversion Rate %
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.technicians.map((t) => (
                  <tr
                    key={t.technicianId}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-2 text-zinc-900 dark:text-zinc-50">
                      {t.technicianName}
                    </td>
                    <td className="py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(t.totalRevenue)}
                    </td>
                    <td className="py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {t.conversionRate != null
                        ? `${t.conversionRate.toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Total:{" "}
            </span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(data.totalRevenue)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
