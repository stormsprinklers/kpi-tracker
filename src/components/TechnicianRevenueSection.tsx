"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MetricTooltip } from "./MetricTooltip";
import { useSession } from "next-auth/react";

interface TechnicianRevenue {
  technicianId: string;
  technicianName: string;
  totalRevenue: number;
  conversionRate: number | null;
  revenuePerHour: number | null;
}

interface TechnicianRevenueResult {
  technicians: TechnicianRevenue[];
  totalRevenue: number;
}

interface TechnicianCard {
  technicianId: string;
  technicianName: string;
  revenuePerHour: number | null;
  totalRevenue: number;
  conversionRate: number | null;
  fiveStarReviews: number | null;
  photoUrl: string | null;
}

type DatePreset = "all" | "7d" | "14d" | "30d" | "thisMonth" | "lastMonth" | "custom";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getDateRange(preset: DatePreset, customStart?: string, customEnd?: string): { startDate?: string; endDate?: string } {
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
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: endLast.toISOString().slice(0, 10),
    };
  }
  return {};
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

export function TechnicianRevenueSection() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [viewTab, setViewTab] = useState<"cards" | "tables">("cards");
  const [datePreset, setDatePreset] = useState<DatePreset>("14d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [data, setData] = useState<TechnicianRevenueResult | null>(null);
  const [cards, setCards] = useState<TechnicianCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const range = getDateRange(datePreset, customStartDate, customEndDate);
    const params = new URLSearchParams();
    if (range.startDate) params.set("startDate", range.startDate);
    if (range.endDate) params.set("endDate", range.endDate);
    const url = `/api/metrics/technician-revenue${params.toString() ? `?${params}` : ""}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load metrics");
      const result: TechnicianRevenueResult = await res.json();
      setData(result);

      const technicianIds = result.technicians.map((t) => t.technicianId);
      const photosRes =
        technicianIds.length > 0
          ? await fetch(`/api/technicians/photos?ids=${technicianIds.join(",")}`)
          : null;
      const photosData = photosRes?.ok ? await photosRes.json() : {};
      const photos: Record<string, string> = photosData.photos ?? {};

      const merged: TechnicianCard[] = result.technicians.map((t) => ({
        technicianId: t.technicianId,
        technicianName: t.technicianName,
        revenuePerHour: t.revenuePerHour,
        totalRevenue: t.totalRevenue,
        conversionRate: t.conversionRate,
        fiveStarReviews: null,
        photoUrl: photos[t.technicianId] ?? null,
      }));
      setCards(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [datePreset, customStartDate, customEndDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePhotoUpload = async (technicianId: string, file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploadingId(technicianId);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch(`/api/technicians/${technicianId}/photo`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      await fetchData();
    } catch {
      setError("Photo upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  const canUploadPhoto = (technicianId: string) => {
    if (!session?.user) return false;
    const role = session.user.role;
    const hcpId = session.user.hcpEmployeeId;
    return role === "admin" || (role === "employee" && hcpId === technicianId);
  };

  const dateSelector = (
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
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
          />
          <span className="text-sm text-zinc-500">to</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => setCustomEndDate(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
          />
        </>
      )}
    </div>
  );

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Technician KPIs
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Revenue per hour, total revenue, conversion rate, and 5-star reviews. Only technicians with jobs in the current year.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div className="flex rounded border border-zinc-300 dark:border-zinc-600">
              <button
                type="button"
                onClick={() => setViewTab("cards")}
                className={`px-3 py-1.5 text-sm ${viewTab === "cards" ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
              >
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewTab("tables")}
                className={`px-3 py-1.5 text-sm ${viewTab === "tables" ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
              >
                Tables
              </button>
            </div>
          )}
          {dateSelector}
        </div>
      </div>
      {loading && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {!loading && !error && (!data || data.technicians.length === 0) && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          No technician KPI data for this period. Connect Housecall Pro and ensure jobs are marked paid or have paid invoices.
        </p>
      )}
      {!loading && !error && data && data.technicians.length > 0 && viewTab === "tables" && isAdmin && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Technician</th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                    <MetricTooltip label="Revenue" tooltip="Total paid revenue from jobs assigned to this technician. Uses job paid amount minus outstanding, split across co-assigned techs." />
                  </th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                    <MetricTooltip label="Conversion Rate %" tooltip="Share of estimates with an approved option. Calculated as (approved estimates / total estimates) × 100 for this technician." />
                  </th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">
                    <MetricTooltip label="Rev/Hr" tooltip="Revenue per billable hour. Total job revenue on days with time entries, divided by hours logged." />
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.technicians.map((t) => (
                  <tr key={t.technicianId} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 text-zinc-900 dark:text-zinc-50">{t.technicianName}</td>
                    <td className="py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(t.totalRevenue)}
                    </td>
                    <td className="py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {t.conversionRate != null ? `${t.conversionRate.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {t.revenuePerHour != null ? `${formatCurrency(t.revenuePerHour)}/hr` : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <MetricTooltip label="Total" tooltip="Sum of revenue across all technicians in the period." />:{" "}
            </span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(data.totalRevenue)}
            </span>
          </div>
        </>
      )}
      {!loading && !error && cards.length > 0 && (viewTab === "cards" || !isAdmin) && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map((card) => (
              <div
                key={card.technicianId}
                className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900/50"
              >
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <input
                      ref={(el) => {
                        fileInputRefs.current[card.technicianId] = el;
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePhotoUpload(card.technicianId, f);
                        e.target.value = "";
                      }}
                    />
                    {card.photoUrl ? (
                      <img
                        src={card.photoUrl}
                        alt={card.technicianName}
                        className="h-14 w-14 rounded-full object-cover ring-2 ring-zinc-200 dark:ring-zinc-600"
                      />
                    ) : (
                      <div
                        className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-300 text-lg font-semibold text-zinc-600 dark:bg-zinc-600 dark:text-zinc-300"
                        title={card.technicianName}
                      >
                        {getInitials(card.technicianName)}
                      </div>
                    )}
                    {canUploadPhoto(card.technicianId) && (
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[card.technicianId]?.click()}
                        disabled={uploadingId === card.technicianId}
                        className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-white shadow hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
                        title="Upload photo"
                      >
                        {uploadingId === card.technicianId ? (
                          <span className="text-xs">…</span>
                        ) : (
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                      {card.technicianName}
                    </h3>
                  </div>
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500 dark:text-zinc-400">
                      <MetricTooltip label="Rev/Hr" tooltip="Revenue per billable hour. Total job revenue on days with time entries, divided by hours logged." />
                    </dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                      {card.revenuePerHour != null ? `${formatCurrency(card.revenuePerHour)}/hr` : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500 dark:text-zinc-400">
                      <MetricTooltip label="Total Revenue" tooltip="Total paid revenue from jobs assigned to this technician in the period." />
                    </dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(card.totalRevenue)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500 dark:text-zinc-400">
                      <MetricTooltip label="Conversion Rate" tooltip="Share of estimates with an approved option. (approved / total) × 100 for this technician." />
                    </dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                      {card.conversionRate != null ? `${card.conversionRate.toFixed(1)}%` : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500 dark:text-zinc-400">
                      <MetricTooltip label="5-star Reviews" tooltip="Number of 5-star reviews attributed to this technician. Populated when review data is connected." />
                    </dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                      {card.fiveStarReviews != null ? card.fiveStarReviews : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <MetricTooltip label="Total Revenue" tooltip="Sum of revenue across all technicians in the period." />:{" "}
            </span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(data?.totalRevenue ?? 0)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
