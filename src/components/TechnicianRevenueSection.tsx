"use client";

import { useEffect, useState } from "react";

interface TechnicianRevenue {
  technicianId: string;
  technicianName: string;
  totalRevenue: number;
}

interface TechnicianRevenueResult {
  technicians: TechnicianRevenue[];
  totalRevenue: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function TechnicianRevenueSection() {
  const [data, setData] = useState<TechnicianRevenueResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/metrics/technician-revenue")
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Technician Revenue
        </h2>
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Loading...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Technician Revenue
        </h2>
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      </section>
    );
  }

  if (!data || data.technicians.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Technician Revenue
        </h2>
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          No technician revenue data yet. Connect Housecall Pro and ensure jobs
          are marked paid or have paid invoices.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Technician Revenue
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Total revenue by technician (from jobs paid or invoices paid)
      </p>
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
    </section>
  );
}
