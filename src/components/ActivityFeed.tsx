"use client";

import { useCallback, useEffect, useState } from "react";

export interface ActivityFeedItem {
  id: number;
  activity_type: string;
  message: string;
  technician_name: string | null;
  city: string | null;
  amount: number | null;
  created_at: string;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDay < 7) return `${diffDay} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ActivityFeed({ connected }: { connected: boolean }) {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/activity-feed");
      if (!res.ok) throw new Error("Failed to load activity feed");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchFeed();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [connected, fetchFeed]);

  if (!connected) return null;

  return (
    <section>
      <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Activity Feed
      </h2>
      <div className="max-h-[320px] overflow-y-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {loading && items.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Loading…
          </div>
        ) : error && items.length === 0 ? (
          <div className="p-6 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No recent activity. Events will appear here as jobs are booked, technicians head to jobs, estimates are approved, and payments come in.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
              >
                <p className="flex-1 text-zinc-900 dark:text-zinc-50">
                  {item.message}
                </p>
                <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                  {formatRelativeTime(item.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
