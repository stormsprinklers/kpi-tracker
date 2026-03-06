"use client";

import { useEffect, useState } from "react";

interface SyncStatus {
  companyId?: string;
  lastSyncAt: string | null;
}

export function SyncStatusSection() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fetchStatus() {
    setError(null);
    fetch("/api/sync")
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data) => setStatus({ lastSyncAt: data.lastSyncAt ?? null, companyId: data.companyId }))
      .catch((err) => setError(err.message ?? "Failed to load"));
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details ?? data.error ?? "Sync failed");
      setStatus((prev) => ({ ...prev, lastSyncAt: new Date().toISOString() }));
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function formatLastSync(iso: string | null): string {
    if (!iso) return "Never";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString(undefined, { dateStyle: "short", timeStyle: "short" });
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Data Sync
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">
          Last synced: {status ? formatLastSync(status.lastSyncAt) : "—"}
        </span>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}
