"use client";

import { useEffect, useRef, useState } from "react";

interface ActivityFeedEvent {
  type: "job_completed" | "csr_booking";
  timestamp: string;
  technicianName?: string;
  amount?: number;
  csrName?: string;
  dateLabel?: string;
  city?: string;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { dateStyle: "short" });
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ActivityFeed({ connected }: { connected: boolean }) {
  const [events, setEvents] = useState<ActivityFeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFeed = () => {
    fetch("/api/activity-feed")
      .then((res) => res.json())
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      return;
    }
    fetchFeed();

    pollRef.current = setInterval(fetchFeed, 60_000);

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else {
        fetchFeed();
        pollRef.current = setInterval(fetchFeed, 60_000);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [connected]);

  if (!connected) return null;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Activity Feed
      </h2>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        Most recent money-making events
      </p>
      {loading ? (
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800"
            />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          No recent activity
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {events.map((e) => (
            <li
              key={`${e.type}-${e.timestamp}`}
              className="flex items-start justify-between gap-2 rounded border border-zinc-100 p-3 text-sm animate-activity-fade-in dark:border-zinc-800"
            >
              <span className="text-zinc-900 dark:text-zinc-50">
                {e.type === "job_completed" ? (
                  <>
                    <strong>{e.technicianName ?? "A technician"}</strong>
                    {" just completed a job worth "}
                    {e.amount != null ? formatAmount(e.amount) : "—"}
                  </>
                ) : (
                  <>
                    <strong>{e.csrName ?? "A CSR"}</strong>
                    {" just booked an appointment"}
                    {e.dateLabel && ` for ${e.dateLabel}`}
                    {e.city && ` in ${e.city}`}
                  </>
                )}
              </span>
              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                {formatRelativeTime(e.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
