"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  revenuePerHour14d: number | null;
  totalRevenueAllTime: number;
  conversionRate: number | null;
  fiveStarReviews: number | null;
  photoUrl: string | null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function get14DayRange(): { startDate: string; endDate: string } {
  const today = new Date();
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  const start = new Date(today);
  start.setDate(start.getDate() - 14);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TechnicianRevenueSection() {
  const { data: session } = useSession();
  const [cards, setCards] = useState<TechnicianCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [totalRevenueAllTime, setTotalRevenueAllTime] = useState(0);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = get14DayRange();
      const params14d = new URLSearchParams({ startDate, endDate });
      const paramsAll = "";

      const [res14d, resAll] = await Promise.all([
        fetch(`/api/metrics/technician-revenue?${params14d}`),
        fetch(`/api/metrics/technician-revenue`),
      ]);

      if (!res14d.ok || !resAll.ok) throw new Error("Failed to load metrics");
      const data14d: TechnicianRevenueResult = await res14d.json();
      const dataAll: TechnicianRevenueResult = await resAll.json();

      const technicianIds = [
        ...new Set([
          ...data14d.technicians.map((t) => t.technicianId),
          ...dataAll.technicians.map((t) => t.technicianId),
        ]),
      ];
      const photosRes =
        technicianIds.length > 0
          ? await fetch(`/api/technicians/photos?ids=${technicianIds.join(",")}`)
          : null;
      const photosData = photosRes?.ok ? await photosRes.json() : {};
      const photos: Record<string, string> = photosData.photos ?? {};

      const byId14d = new Map(data14d.technicians.map((t) => [t.technicianId, t]));
      const byIdAll = new Map(dataAll.technicians.map((t) => [t.technicianId, t]));

      const merged: TechnicianCard[] = technicianIds.map((id) => {
        const t14 = byId14d.get(id);
        const tAll = byIdAll.get(id);
        const name =
          t14?.technicianName ??
          tAll?.technicianName ??
          (id.startsWith("pro_") || id.startsWith("emp_") ? "Former technician" : `Technician ${id}`);
        return {
          technicianId: id,
          technicianName: name,
          revenuePerHour14d: t14?.revenuePerHour ?? null,
          totalRevenueAllTime: tAll?.totalRevenue ?? 0,
          conversionRate: t14?.conversionRate ?? null,
          fiveStarReviews: null,
          photoUrl: photos[id] ?? null,
        };
      });

      merged.sort((a, b) => b.totalRevenueAllTime - a.totalRevenueAllTime);
      setCards(merged);
      setTotalRevenueAllTime(dataAll.totalRevenue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Technician KPIs
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Revenue per hour (14-day avg), total revenue (all time), conversion rate, and 5-star reviews
          </p>
        </div>
      </div>
      {loading && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {!loading && !error && cards.length === 0 && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          No technician KPI data. Connect Housecall Pro and ensure jobs are marked paid or have paid invoices.
        </p>
      )}
      {!loading && !error && cards.length > 0 && (
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
                    <dt className="text-zinc-500 dark:text-zinc-400">Rev/Hr (14d)</dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                      {card.revenuePerHour14d != null
                        ? `${formatCurrency(card.revenuePerHour14d)}/hr`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500 dark:text-zinc-400">Total Revenue</dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(card.totalRevenueAllTime)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500 dark:text-zinc-400">Conversion Rate</dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                      {card.conversionRate != null
                        ? `${card.conversionRate.toFixed(1)}%`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500 dark:text-zinc-400">5-star Reviews</dt>
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
              Total Revenue (all time):{" "}
            </span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(totalRevenueAllTime)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
