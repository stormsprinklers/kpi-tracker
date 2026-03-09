"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

interface CsrKpiEntry {
  csrId: string;
  csrName: string;
  bookingRate: number | null;
  avgCallDurationMinutes: number | null;
  leadResponseTimeMinutes: number | null;
  avgBookedCallRevenue: number | null;
  photoUrl?: string | null;
}

type DatePreset = "7d" | "14d" | "30d" | "thisMonth" | "lastMonth" | "all";

const PRESET_LABELS: Record<DatePreset, string> = {
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  all: "All time",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Display name with last initial only, e.g. "John Smith" → "John S." */
function toLastInitialOnly(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  const last = parts[parts.length - 1];
  const lastInitial = last.charAt(0).toUpperCase();
  return parts.slice(0, -1).join(" ") + " " + lastInitial + ".";
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function CsrKpisSection() {
  const { data: session } = useSession();
  const [datePreset, setDatePreset] = useState<DatePreset>("14d");
  const [cards, setCards] = useState<CsrKpiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const today = new Date();
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    const endStr = end.toISOString().slice(0, 10);
    const params = new URLSearchParams();
    let startStr: string;
    if (datePreset === "7d") {
      const s = new Date(today);
      s.setDate(s.getDate() - 7);
      startStr = s.toISOString().slice(0, 10);
      params.set("startDate", startStr);
      params.set("endDate", endStr);
    } else if (datePreset === "14d") {
      const s = new Date(today);
      s.setDate(s.getDate() - 14);
      startStr = s.toISOString().slice(0, 10);
      params.set("startDate", startStr);
      params.set("endDate", endStr);
    } else if (datePreset === "30d") {
      const s = new Date(today);
      s.setDate(s.getDate() - 30);
      startStr = s.toISOString().slice(0, 10);
      params.set("startDate", startStr);
      params.set("endDate", endStr);
    } else if (datePreset === "thisMonth") {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      startStr = s.toISOString().slice(0, 10);
      params.set("startDate", startStr);
      params.set("endDate", endStr);
    } else if (datePreset === "lastMonth") {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      params.set("startDate", s.toISOString().slice(0, 10));
      params.set("endDate", e.toISOString().slice(0, 10));
    } else {
      params.set("startDate", "2000-01-01");
      params.set("endDate", "2100-12-31");
    }
    try {
      const res = await fetch(`/api/metrics/csr-kpis?${params}`);
      if (!res.ok) throw new Error("Failed to load CSR KPIs");
      const data: CsrKpiEntry[] = await res.json();
      const csrIds = data.map((c) => c.csrId);
      const photosRes = csrIds.length > 0 ? await fetch(`/api/technicians/photos?ids=${csrIds.join(",")}`) : null;
      const photosData = photosRes?.ok ? await photosRes.json() : {};
      const photos: Record<string, string> = photosData.photos ?? {};
      const merged = data.map((c) => ({ ...c, photoUrl: photos[c.csrId] ?? null }));
      setCards(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [datePreset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePhotoUpload = async (csrId: string, file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploadingId(csrId);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch(`/api/technicians/${csrId}/photo`, {
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

  const canUploadPhoto = (csrId: string) => {
    if (!session?.user) return false;
    return session.user.role === "admin" || (session.user.role === "employee" && session.user.hcpEmployeeId === csrId);
  };

  const dateSelector = (
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
  );

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            CSR KPIs
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Office staff metrics: booking rate, call duration, lead response time. Data from GoHighLevel call webhooks.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{dateSelector}</div>
      </div>
      {loading && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {!loading && !error && cards.length === 0 && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          No office staff found. Sync Housecall Pro and ensure employees have &quot;office staff&quot; role.
        </p>
      )}
      {!loading && !error && cards.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.csrId}
              href={`/call-insights/csr/${card.csrId}`}
              className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900/50"
            >
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div
                    className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-zinc-300 text-lg font-semibold text-zinc-600 dark:bg-zinc-600 dark:text-zinc-300"
                    title={toLastInitialOnly(card.csrName)}
                  >
                    {card.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      getInitials(card.csrName)
                    )}
                  </div>
                  {canUploadPhoto(card.csrId) && (
                    <button
                      type="button"
                      className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs text-white shadow-md transition-colors hover:bg-[var(--color-primary-hover)]"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        fileInputRefs.current[card.csrId]?.click();
                      }}
                      aria-label="Upload photo"
                      disabled={!!uploadingId}
                    >
                      {uploadingId === card.csrId ? "..." : "+"}
                    </button>
                  )}
                  <input
                    ref={(el) => { fileInputRefs.current[card.csrId] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(card.csrId, file);
                      e.target.value = "";
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                    {toLastInitialOnly(card.csrName)}
                  </h3>
                </div>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Booking Rate</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {card.bookingRate != null ? `${card.bookingRate.toFixed(1)}%` : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Avg Call Duration</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {card.avgCallDurationMinutes != null
                      ? formatDuration(card.avgCallDurationMinutes)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Lead Response Time</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {card.leadResponseTimeMinutes != null
                      ? formatDuration(card.leadResponseTimeMinutes)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Avg Booked Call Revenue</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {card.avgBookedCallRevenue != null
                      ? `$${card.avgBookedCallRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
