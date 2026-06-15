"use client";

import { useEffect, useState } from "react";

interface SyncStatus {
  companyId?: string;
  lastSyncAt: string | null;
  lastEmployeesSyncAt: string | null;
}

export function SyncStatusSection() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingEmployees, setSyncingEmployees] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function fetchStatus() {
    setError(null);
    Promise.all([
      fetch("/api/sync").then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json() as Promise<{ lastSyncAt?: string | null; companyId?: string }>;
      }),
      fetch("/api/sync/employees").then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json() as Promise<{ lastSyncAt?: string | null; companyId?: string }>;
      }),
    ])
      .then(([full, employees]) =>
        setStatus({
          companyId: full.companyId ?? employees.companyId,
          lastSyncAt: full.lastSyncAt ?? null,
          lastEmployeesSyncAt: employees.lastSyncAt ?? null,
        })
      )
      .catch((err) => setError(err.message ?? "Failed to load"));
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  async function handleSyncAll() {
    setSyncingAll(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = (await res.json()) as { details?: string; error?: string };
      if (!res.ok) throw new Error(data.details ?? data.error ?? "Sync failed");
      setSuccess("Full sync completed.");
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingAll(false);
    }
  }

  async function handleSyncEmployees() {
    setSyncingEmployees(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/sync/employees", { method: "POST" });
      const data = (await res.json()) as {
        details?: string;
        error?: string;
        entitiesSynced?: { employees?: number; pros?: number };
      };
      if (!res.ok) throw new Error(data.details ?? data.error ?? "Employee sync failed");
      const emp = data.entitiesSynced?.employees ?? 0;
      const pros = data.entitiesSynced?.pros ?? 0;
      setSuccess(`Synced ${emp} employee(s) and ${pros} pro(s).`);
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Employee sync failed");
    } finally {
      setSyncingEmployees(false);
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
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  }

  const busy = syncingAll || syncingEmployees;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Data Sync</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Sync employees only to refresh crews, invites, and performance pay rosters (fast). Full sync
        pulls jobs, invoices, and estimates for KPIs and may take several minutes.
      </p>
      <div className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <p>
          Employees & pros:{" "}
          {status ? formatLastSync(status.lastEmployeesSyncAt) : "—"}
        </p>
        <p>
          Full data (jobs, etc.): {status ? formatLastSync(status.lastSyncAt) : "—"}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSyncEmployees()}
          disabled={busy}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {syncingEmployees ? "Syncing employees…" : "Sync employees"}
        </button>
        <button
          type="button"
          onClick={() => void handleSyncAll()}
          disabled={busy}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {syncingAll ? "Syncing all…" : "Sync all data"}
        </button>
      </div>
      {success && (
        <p className="mt-2 text-sm text-green-700 dark:text-green-400">{success}</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
