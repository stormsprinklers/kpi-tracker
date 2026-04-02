"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardDateRange } from "@/lib/dashboardDateRange";
import { MetricTooltip } from "./MetricTooltip";
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

function csrKpisQueryParams(dateRange: DashboardDateRange): URLSearchParams {
  const params = new URLSearchParams();
  if (!dateRange.isAllTime && dateRange.startDate && dateRange.endDate) {
    params.set("startDate", dateRange.startDate);
    params.set("endDate", dateRange.endDate);
  }
  return params;
}

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

export function CsrKpisSection({ dateRange }: { dateRange: DashboardDateRange }) {
  const { data: session } = useSession();
  const [cards, setCards] = useState<CsrKpiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = csrKpisQueryParams(dateRange);
    const qs = params.toString();
    try {
      const res = await fetch(`/api/metrics/csr-kpis${qs ? `?${qs}` : ""}`);
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
  }, [dateRange]);

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
      if (!res.ok) {
        let msg = "Upload failed";
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) msg = data.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  const canUploadPhoto = (csrId: string) => {
    if (!session?.user) return false;
    return session.user.role === "admin" || (session.user.role === "employee" && session.user.hcpEmployeeId === csrId);
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          CSR KPIs
        </h2>
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
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    <MetricTooltip label="Booking Rate" tooltip="Percentage of opportunity calls (won + lost) that resulted in a booking. (Won / Opportunity Calls) × 100." />
                  </dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {card.bookingRate != null ? `${card.bookingRate.toFixed(1)}%` : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    <MetricTooltip label="Avg Call Duration" tooltip="Average call length in minutes. From duration_seconds on GHL call records." />
                  </dt>
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
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    <MetricTooltip label="Avg Booked Call Revenue" tooltip="Average job total_amount for won calls with linked jobs. Reflects value of calls that turned into appointments." />
                  </dt>
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
